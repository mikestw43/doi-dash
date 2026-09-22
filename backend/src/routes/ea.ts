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

/**
 * Descriptions the form edited on files that are already stored, as
 * [{ id, label }]. Anything malformed is dropped rather than failing the save:
 * the uploads in the same request are the part that cannot be redone.
 */
const metaFrom = (raw: unknown): { id: string; label: string }[] => {
  if (typeof raw !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap(entry =>
      entry && typeof entry === 'object'
      && typeof (entry as { id?: unknown }).id === 'string'
        ? [{
            id: (entry as { id: string }).id,
            label: String((entry as { label?: unknown }).label ?? ''),
          }]
        : []);
  } catch {
    return [];
  }
};

/** Express 5 types a param as string | string[]; narrow it the way the other
 *  routers in this codebase do. */
const param = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] : (value ?? '');

const serialize = (item: {
  id: string; name: string; type: string; description: string; tags: string;
  createdAt: Date; updatedAt: Date;
  images: { id: string; filename: string; caption: string; size: number }[];
  files: { id: string; filename: string; label: string; size: number; createdAt: Date }[];
}) => ({
  id: item.id,
  name: item.name,
  type: item.type,
  description: item.description,
  tags: item.tags ? item.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
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
  const { name, type, description, tags } = req.body as Record<string, string>;
  if (!name?.trim() || !type?.trim()) {
    res.status(400).json({ error: 'name and type are required' });
    return;
  }

  const item = await prisma.eaItem.create({
    data: {
      name: name.trim(),
      type: type.trim(),
      description: description?.trim() ?? '',
      tags: (tags ?? '').split(',').map(s => s.trim()).filter(Boolean).join(','),
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

router.put('/:id', uploadFields, async (req: AuthRequest, res: Response) => {
  const existing = await prisma.eaItem.findUnique({ where: { id: param(req.params.id) } });
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const { name, type, description, tags } = req.body as Record<string, string>;
  await prisma.eaItem.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(type !== undefined && { type: type.trim() }),
      ...(description !== undefined && { description: description.trim() }),
      ...(tags !== undefined && {
        tags: tags.split(',').map(s => s.trim()).filter(Boolean).join(','),
      }),
    },
  });

  // A description edited on a file that is already stored. Scoped to this
  // item's own files, so an id from another entry cannot be relabelled.
  for (const { id, label } of metaFrom(req.body.fileMeta)) {
    const file = await prisma.eaFile.findUnique({ where: { id } });
    if (file?.itemId === existing.id && file.label !== label) {
      await prisma.eaFile.update({ where: { id }, data: { label: label.trim() } });
    }
  }

  // Removals are ids the form no longer shows; new uploads simply append.
  for (const id of labelsFrom(req.body.removeImageIds)) {
    const img = await prisma.eaImage.findUnique({ where: { id } });
    if (img?.itemId === existing.id) {
      await prisma.eaImage.delete({ where: { id } });
      removeFromDisk(img.storedName);
    }
  }
  for (const id of labelsFrom(req.body.removeFileIds)) {
    const file = await prisma.eaFile.findUnique({ where: { id } });
    if (file?.itemId === existing.id) {
      await prisma.eaFile.delete({ where: { id } });
      removeFromDisk(file.storedName);
    }
  }

  await attachUploads(
    existing.id,
    req.files as MulterFiles,
    labelsFrom(req.body.imageCaptions),
    labelsFrom(req.body.fileLabels),
  );

  const full = await prisma.eaItem.findUnique({ where: { id: existing.id }, include: withChildren });
  res.json(serialize(full!));
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
