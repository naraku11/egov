/**
 * @file upload.js
 * @description Multer-based file-upload middleware for the eGov API.
 *
 * Configures and exports two separate Multer instances:
 *
 *  - `upload`       – Handles ticket attachments (images, documents, videos).
 *                     Files are stored under `<project>/backend/uploads/tickets/`.
 *                     Maximum size is controlled by the `MAX_FILE_SIZE_MB`
 *                     environment variable (defaults to 10 MB).
 *
 *  - `avatarUpload` – Handles user/servant profile-picture uploads (images
 *                     only).  Files are stored under
 *                     `<project>/backend/uploads/avatars/`.
 *                     Hard-capped at 2 MB regardless of environment config.
 *
 * Both instances use disk storage with collision-safe filenames generated from
 * a timestamp + random integer, and both lazily create their target directories
 * if they do not already exist.
 */

import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Derive __filename and __dirname equivalents for ES-module scope, since these
// globals are not available natively in ESM files.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the root uploads directory relative to this file's location.
// Path: backend/uploads/
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

// Ensure the root uploads directory exists before Multer tries to write into it.
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ── Ticket attachments ──────────────────────────────────────────────────────

/**
 * Disk-storage configuration for ticket attachment uploads.
 * Each uploaded file is placed in `uploads/tickets/` with a unique filename.
 */
const storage = multer.diskStorage({
  /**
   * Resolves (and lazily creates) the per-category subdirectory for tickets.
   *
   * @param {import('express').Request} req
   * @param {Express.Multer.File} file
   * @param {function} cb - Multer callback: cb(error, destinationPath)
   */
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, 'tickets');
    // Create the tickets subdirectory on first use if it does not exist yet.
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },

  /**
   * Generates a collision-safe filename by combining a Unix timestamp with a
   * large random integer, then appending the original file extension.
   *
   * @param {import('express').Request} req
   * @param {Express.Multer.File} file
   * @param {function} cb - Multer callback: cb(error, filename)
   */
  filename: (req, file, cb) => {
    // Combine epoch ms + random 9-digit integer for a practically unique name.
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

/**
 * File-type filter for ticket attachments.
 * Accepts common image formats, PDF, Word documents, and video files.
 *
 * @param {import('express').Request} req
 * @param {Express.Multer.File} file
 * @param {function} cb - Multer callback: cb(error, acceptFile)
 */
const fileFilter = (req, file, cb) => {
  // Allowed extensions expressed as a regex for a quick membership test.
  const allowed = /jpeg|jpg|png|gif|pdf|doc|docx|mp4|mov/;
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.test(ext)) {
    cb(null, true);   // Accept the file.
  } else {
    cb(new Error('File type not allowed'));  // Reject with a descriptive error.
  }
};

/**
 * Multer instance for ticket attachment uploads.
 *
 * Usage in a route:
 * ```js
 * router.post('/tickets', upload.array('attachments', 5), handler);
 * ```
 *
 * @type {import('multer').Multer}
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    // Read the cap from the environment; fall back to 10 MB if unset.
    fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024,
  },
});

// ── Avatar uploads ──────────────────────────────────────────────────────────

/**
 * Disk-storage configuration for avatar / profile-picture uploads.
 * Each uploaded file is placed in `uploads/avatars/` with a unique filename.
 */
const avatarStorage = multer.diskStorage({
  /**
   * Resolves (and lazily creates) the avatars subdirectory.
   *
   * @param {import('express').Request} req
   * @param {Express.Multer.File} file
   * @param {function} cb - Multer callback: cb(error, destinationPath)
   */
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, 'avatars');
    // Create the avatars subdirectory on first use if it does not exist yet.
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },

  /**
   * Generates a collision-safe filename for the avatar image.
   * The extension is lower-cased for consistency across operating systems.
   *
   * @param {import('express').Request} req
   * @param {Express.Multer.File} file
   * @param {function} cb - Multer callback: cb(error, filename)
   */
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    // Lower-case the extension to avoid case-sensitivity issues on Linux.
    cb(null, unique + path.extname(file.originalname).toLowerCase());
  },
});

/**
 * File-type filter for avatar uploads.
 * Restricts uploads to web-friendly image formats only.
 *
 * @param {import('express').Request} req
 * @param {Express.Multer.File} file
 * @param {function} cb - Multer callback: cb(error, acceptFile)
 */
const avatarFilter = (req, file, cb) => {
  // Only raster image formats suitable for profile pictures are accepted.
  const allowed = /jpeg|jpg|png|gif|webp/;
  // slice(1) removes the leading dot so the regex matches the bare extension.
  const ext = path.extname(file.originalname).toLowerCase().slice(1);
  if (allowed.test(ext)) {
    cb(null, true);   // Accept the file.
  } else {
    cb(new Error('Only image files are allowed for avatars'));  // Reject non-images.
  }
};

/**
 * Multer instance for avatar / profile-picture uploads.
 *
 * Usage in a route:
 * ```js
 * router.put('/profile/avatar', avatarUpload.single('avatar'), handler);
 * ```
 *
 * @type {import('multer').Multer}
 */
export const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: avatarFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB max
});
