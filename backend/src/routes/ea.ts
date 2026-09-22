import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

// Every route here is behind a login. The repository holds the owner's own
// EAs — a public URL would let anyone who guesses one take the lot.
router.use(authMiddleware);

/**
 * Where the bytes live.
 *
 * Outside the checkout on purpose: deploy/update.sh runs `git pull` over the
 * project directory on every deploy, so anything stored inside it is one
 * conflict away from being lost.
 */
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), '..', 'uploads');
const EA_DIR = path.join(UPLOAD_DIR, 'ea');
fs.mkdirSync(EA_DIR, { recursive: true });

const MAX_FILE_BYTES = 20 * 1024 * 1024;   // one bad upload should not fill the disk
const MAX_FILES_PER_REQUEST = 20;

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/** Disk name: random, extension-free. The original name is kept in the DB and
 *  handed back on download, so a crafted filename cannot escape the folder. */
const storedName = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, EA_DIR),
    filename: (_req, _file, cb) => cb(null, storedName()),
  }),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_REQUEST },
});

const uploadFields = upload.fields([
  { name: 'images', maxCount: MAX_FILES_PER_REQUEST },
  { name: 'files', maxCount: MAX_FILES_PER_REQUEST },
]);

type MulterFiles = Record<string, Express.Multer.File[]> | undefined;

const removeFromDisk = (name: string): void => {
  fs.promises.unlink(path.join(EA_DIR, name)).catch(() => {
    // Already gone, or never written. Losing the row matters; losing a stray
    // blob does not.
  });
};

/** Labels arrive parallel to the uploads: labels[0] describes files[0]. */
const labelsFrom = (raw: unknown): string[] => {
  if (typeof raw !== 'string') return Array.isArray(raw) ? raw.map(String) : [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

/** Express 5 types a param as string | string[]; narrow it the way the other
 *  routers in this codebase do. */
const param = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] : (value ?? '');

/** Both `type` and `tags` are comma-separated lists in one column. */
const asList = (raw: string): string[] =>
  raw ? raw.split(',').map(v => v.trim()).filter(Boolean) : [];

const toCsv = (raw: unknown): string =>
  (Array.isArray(raw) ? raw.map(String) : String(raw ?? '').split(','))
    .map(v => v.trim()).filter(Boolean).join(',');

const serialize = (item: {
  id: string; name: string; type: string; status: string; description: string; tags: string;
  createdAt: Date; updatedAt: Date;
  images: { id: string; filename: string; caption: string; size: number }[];
  files: { id: string; filename: string; label: string; size: number; createdAt: Date }[];
}) => ({
  id: item.id,
  name: item.name,
  type: asList(item.type),
  status: item.status,
  description: item.description,
  tags: asList(item.tags),
  images: item.images,
  files: item.files.map(f => ({ ...f, createdAt: f.createdAt.toISOString().slice(0, 10) })),
  updatedAt: item.updatedAt.toISOString().slice(0, 10),
});

const withChildren = {
  images: { select: { id: true, filename: true, caption: true, size: true } },
  files: {
    select: { id: true, filename: true, label: true, size: true, createdAt: true },
    orderBy: { createdAt: 'desc' as const },
  },
};

// ─── Read ────────────────────────────────────────────────────────────────────

router.get('/', async (_req: AuthRequest, res: Response) => {
  const items = await prisma.eaItem.findMany({
    include: withChildren,
    orderBy: { updatedAt: 'desc' },
  });
  res.json(items.map(serialize));
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const item = await prisma.eaItem.findUnique({
    where: { id: param(req.params.id) },
    include: withChildren,
  });
  if (!item) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(serialize(item));
});

/** The bytes. Streamed through the API rather than served by nginx so the
 *  login check applies — that is the whole point of choosing private. */
const sendStored = (res: Response, record: { storedName: string; filename: string }, inline: boolean) => {
  const full = path.join(EA_DIR, record.storedName);
  if (!fs.existsSync(full)) {
    res.status(404).json({ error: 'File missing on disk' });
    return;
  }
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(record.filename)}"`,
  );
  fs.createReadStream(full).pipe(res);
};

router.get('/files/:fileId/download', async (req: AuthRequest, res: Response) => {
  const file = await prisma.eaFile.findUnique({ where: { id: param(req.params.fileId) } });
  if (!file) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  sendStored(res, file, false);
});

router.get('/images/:imageId/raw', async (req: AuthRequest, res: Response) => {
  const image = await prisma.eaImage.findUnique({ where: { id: param(req.params.imageId) } });
  if (!image) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.setHeader('Content-Type', image.mimeType);
  sendStored(res, image, true);
});

// ─── Write (admin) ───────────────────────────────────────────────────────────

router.use(adminMiddleware);

const attachUploads = async (
  itemId: string,
  files: MulterFiles,
  imageCaptions: string[],
  fileLabels: string[],
) => {
  const images = files?.images ?? [];
  const docs = files?.files ?? [];

  for (const [i, f] of images.entries()) {
    if (!IMAGE_TYPES.has(f.mimetype)) {
      removeFromDisk(f.filename);
      continue;
    }
    await prisma.eaImage.create({
      data: {
        itemId,
        storedName: f.filename,
        filename: f.originalname,
        caption: imageCaptions[i] ?? '',
        mimeType: f.mimetype,
        size: f.size,
      },
    });
  }

  for (const [i, f] of docs.entries()) {
    await prisma.eaFile.create({
      data: {
        itemId,
        storedName: f.filename,
        filename: f.originalname,
        label: fileLabels[i] ?? '',
        size: f.size,
      },
    });
  }
};

router.post('/', uploadFields, async (req: AuthRequest, res: Response) => {
  const { name, type, status, description, tags } = req.body as Record<string, string>;
  const types = toCsv(type);
  if (!name?.trim() || !types) {
    res.status(400).json({ error: 'name and at least one type are required' });
    return;
  }

  const item = await prisma.eaItem.create({
    data: {
      name: name.trim(),
      type: types,
      ...(status?.trim() && { status: status.trim() }),
      description: description?.trim() ?? '',
      tags: toCsv(tags),
      createdBy: req.user?.id,
    },
  });

  await attachUploads(
    item.id,
    req.files as MulterFiles,
    labelsFrom(req.body.imageCaptions),
    labelsFrom(req.body.fileLabels),
  );

  const full = await prisma.eaItem.findUnique({ where: { id: item.id }, include: withChildren });
  res.status(201).json(serialize(full!));
});

/**
 * Edit the text.
 *
 * One entry, four fields, no files: a description or a tag is fixed without
 * the request being able to touch an upload, so a mistyped edit can never cost
 * a file. What the form sends is what changes — an absent field is left alone.
 */
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.eaItem.findUnique({ where: { id: param(req.params.id) } });
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const { name, type, status, description, tags } = req.body as Record<string, unknown>;
  if (name !== undefined && !String(name).trim()) {
    res.status(400).json({ error: 'name cannot be empty' });
    return;
  }
  // An entry with no type at all would fall out of every filter, so a request
  // that clears the list is refused rather than silently losing the entry.
  if (type !== undefined && !toCsv(type)) {
    res.status(400).json({ error: 'at least one type is required' });
    return;
  }

  await prisma.eaItem.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined && { name: String(name).trim() }),
      ...(type !== undefined && { type: toCsv(type) }),
      ...(status !== undefined && { status: String(status).trim() }),
      ...(description !== undefined && { description: String(description).trim() }),
      ...(tags !== undefined && { tags: toCsv(tags) }),
    },
  });

  res.json(serialize((await prisma.eaItem.findUnique({
    where: { id: existing.id }, include: withChildren,
  }))!));
});

// ─── One attachment at a time ────────────────────────────────────────────────
//
// A description, a deletion and an upload are three separate requests against
// three separate URLs. Each is small enough to apply the moment it happens, so
// there is nothing held in a form waiting on a Save that a stray click could
// throw away — and a failure loses only the one thing that failed.

/** Add files to an entry that already exists. */
router.post('/:id/files', uploadFields, async (req: AuthRequest, res: Response) => {
  const existing = await prisma.eaItem.findUnique({ where: { id: param(req.params.id) } });
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await attachUploads(
    existing.id,
    req.files as MulterFiles,
    labelsFrom(req.body.imageCaptions),
    labelsFrom(req.body.fileLabels),
  );
  res.json(serialize((await prisma.eaItem.findUnique({
    where: { id: existing.id }, include: withChildren,
  }))!));
});

router.patch('/files/:fileId', async (req: AuthRequest, res: Response) => {
  const file = await prisma.eaFile.findUnique({ where: { id: param(req.params.fileId) } });
  if (!file) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await prisma.eaFile.update({
    where: { id: file.id },
    data: { label: String(req.body.label ?? '').trim() },
  });
  res.json({ ok: true });
});

router.patch('/images/:imageId', async (req: AuthRequest, res: Response) => {
  const image = await prisma.eaImage.findUnique({ where: { id: param(req.params.imageId) } });
  if (!image) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await prisma.eaImage.update({
    where: { id: image.id },
    data: { caption: String(req.body.caption ?? '').trim() },
  });
  res.json({ ok: true });
});

router.delete('/files/:fileId', async (req: AuthRequest, res: Response) => {
  const file = await prisma.eaFile.findUnique({ where: { id: param(req.params.fileId) } });
  if (!file) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await prisma.eaFile.delete({ where: { id: file.id } });
  removeFromDisk(file.storedName);
  res.json({ ok: true });
});

router.delete('/images/:imageId', async (req: AuthRequest, res: Response) => {
  const image = await prisma.eaImage.findUnique({ where: { id: param(req.params.imageId) } });
  if (!image) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await prisma.eaImage.delete({ where: { id: image.id } });
  removeFromDisk(image.storedName);
  res.json({ ok: true });
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const item = await prisma.eaItem.findUnique({
    where: { id: param(req.params.id) },
    include: { images: true, files: true },
  });
  if (!item) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  // Cascade clears the rows; the blobs are ours to sweep up.
  for (const i of item.images) removeFromDisk(i.storedName);
  for (const f of item.files) removeFromDisk(f.storedName);
  await prisma.eaItem.delete({ where: { id: item.id } });

  res.json({ ok: true });
});

export default router;
