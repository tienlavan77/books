/* Provides module implementation and exported declarations for books-repo.js. */

import crypto from "node:crypto";
import {
  getPrismaClient,
  readFallbackStore,
  writeFallbackStore,
  isDatabaseConnectionError,
} from "./db.js";

/* Executes documented symbol logic in books-repo.js. */
function attachProgressToBook(book, progressMap) {
  const progress = progressMap.get(book.id) || null;
  return {
    ...book,
    createdAt: new Date(book.createdAt),
    updatedAt: new Date(book.updatedAt),
    progress: progress
      ? {
          ...progress,
          createdAt: new Date(progress.createdAt),
          updatedAt: new Date(progress.updatedAt),
        }
      : null,
  };
}

/* Executes documented symbol logic in books-repo.js. */
function listFallbackBooks(normalizedSearch) {
  const store = readFallbackStore();
  const progressMap = new Map(store.readingProgress.map((item) => [item.bookId, item]));
  return store.books
    .filter((book) => {
      if (!normalizedSearch) return true;
      return (
        String(book.title || "").toLowerCase().includes(normalizedSearch) ||
        String(book.originalName || "").toLowerCase().includes(normalizedSearch)
      );
    })
    .map((book) => attachProgressToBook(book, progressMap));
}

/* Executes documented symbol logic in books-repo.js. */
function sortBooksList(books, sort) {
  const copy = [...books];
  copy.sort((a, b) => {
    if (sort === "title") {
      return String(a.title || "").localeCompare(String(b.title || ""), "vi", {
        sensitivity: "base",
      });
    }
    if (sort === "created") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (sort === "progress") {
      const pa = a.progress?.progressPercent ?? 0;
      const pb = b.progress?.progressPercent ?? 0;
      if (pb !== pa) return pb - pa;
    }
    const timeA = a.progress?.updatedAt
      ? new Date(a.progress.updatedAt).getTime()
      : new Date(a.createdAt).getTime();
    const timeB = b.progress?.updatedAt
      ? new Date(b.progress.updatedAt).getTime()
      : new Date(b.createdAt).getTime();
    return timeB - timeA;
  });
  return copy;
}

/* Executes documented symbol logic in books-repo.js. */
export async function listBooksWithProgress({ search = "", sort = "recent" } = {}) {
  const normalizedSearch = String(search || "").trim().toLowerCase();
  let books = [];

  if (process.env.BOOKS_DB_DRIVER !== "fallback") {
    try {
      const prisma = getPrismaClient();
      books = await prisma.book.findMany({
        where: normalizedSearch
          ? {
              title: {
                contains: String(search).trim(),
              },
            }
          : undefined,
        include: {
          progress: true,
        },
      });
    } catch (error) {
      if (!isDatabaseConnectionError(error)) {
        throw error;
      }
      books = listFallbackBooks(normalizedSearch);
    }
  } else {
    books = listFallbackBooks(normalizedSearch);
  }

  return sortBooksList(books, sort);
}

/* Executes documented symbol logic in books-repo.js. */
export async function findBookById(bookId) {
  if (!bookId) return null;

  if (process.env.BOOKS_DB_DRIVER !== "fallback") {
    try {
      const prisma = getPrismaClient();
      return await prisma.book.findUnique({
        where: { id: String(bookId) },
        include: { progress: true },
      });
    } catch (error) {
      if (!isDatabaseConnectionError(error)) {
        throw error;
      }
    }
  }

  const store = readFallbackStore();
  const book = store.books.find((item) => item.id === String(bookId));
  if (!book) return null;
  const progressMap = new Map(store.readingProgress.map((item) => [item.bookId, item]));
  return attachProgressToBook(book, progressMap);
}

/* Executes documented symbol logic in books-repo.js. */
export async function createBookRecord({
  title,
  originalName,
  storageKey,
  thumbnailKey = null,
  fileSize,
  pageCount = 1,
  mimeType = "application/pdf",
}) {
  const safePageCount = Math.max(1, Number.parseInt(pageCount, 10) || 1);
  const safeFileSize = Math.max(0, Number.parseInt(fileSize, 10) || 0);

  if (process.env.BOOKS_DB_DRIVER !== "fallback") {
    try {
      const prisma = getPrismaClient();
      return await prisma.book.create({
        data: {
          title: String(title).trim(),
          originalName: String(originalName).trim(),
          storageKey: String(storageKey),
          thumbnailKey: thumbnailKey ? String(thumbnailKey) : null,
          fileSize: safeFileSize,
          pageCount: safePageCount,
          mimeType: String(mimeType || "application/pdf"),
          progress: {
            create: {
              currentPage: 1,
              progressPercent: 0,
            },
          },
        },
        include: {
          progress: true,
        },
      });
    } catch (error) {
      if (!isDatabaseConnectionError(error)) {
        throw error;
      }
    }
  }

  const store = readFallbackStore();
  const now = new Date().toISOString();
  const bookId = `book_${crypto.randomBytes(10).toString("hex")}`;
  const progressId = `prog_${crypto.randomBytes(10).toString("hex")}`;

  const bookRecord = {
    id: bookId,
    title: String(title).trim(),
    originalName: String(originalName).trim(),
    storageKey: String(storageKey),
    thumbnailKey: thumbnailKey ? String(thumbnailKey) : null,
    fileSize: safeFileSize,
    pageCount: safePageCount,
    mimeType: String(mimeType || "application/pdf"),
    createdAt: now,
    updatedAt: now,
  };

  const progressRecord = {
    id: progressId,
    bookId,
    currentPage: 1,
    progressPercent: 0,
    lastDevice: null,
    createdAt: now,
    updatedAt: now,
  };

  store.books.push(bookRecord);
  store.readingProgress.push(progressRecord);
  writeFallbackStore(store);

  return attachProgressToBook(bookRecord, new Map([[bookId, progressRecord]]));
}

/* Executes documented symbol logic in books-repo.js. */
export async function updateBookMetadata(bookId, { title, pageCount, thumbnailKey } = {}) {
  const existing = await findBookById(bookId);
  if (!existing) return null;

  const nextTitle = title !== undefined ? String(title).trim() || existing.title : existing.title;
  const nextPageCount =
    pageCount !== undefined
      ? Math.max(1, Number.parseInt(pageCount, 10) || existing.pageCount)
      : existing.pageCount;
  const nextThumbnailKey =
    thumbnailKey !== undefined ? (thumbnailKey ? String(thumbnailKey) : null) : existing.thumbnailKey;

  if (process.env.BOOKS_DB_DRIVER !== "fallback") {
    try {
      const prisma = getPrismaClient();
      return await prisma.book.update({
        where: { id: String(bookId) },
        data: {
          title: nextTitle,
          pageCount: nextPageCount,
          thumbnailKey: nextThumbnailKey,
        },
        include: { progress: true },
      });
    } catch (error) {
      if (!isDatabaseConnectionError(error)) {
        throw error;
      }
    }
  }

  const store = readFallbackStore();
  const idx = store.books.findIndex((item) => item.id === String(bookId));
  if (idx === -1) return null;

  const now = new Date().toISOString();
  store.books[idx] = {
    ...store.books[idx],
    title: nextTitle,
    pageCount: nextPageCount,
    thumbnailKey: nextThumbnailKey,
    updatedAt: now,
  };
  writeFallbackStore(store);

  const progressMap = new Map(store.readingProgress.map((item) => [item.bookId, item]));
  return attachProgressToBook(store.books[idx], progressMap);
}

/* Executes documented symbol logic in books-repo.js. */
export async function deleteBookRecord(bookId) {
  const existing = await findBookById(bookId);
  if (!existing) return null;

  if (process.env.BOOKS_DB_DRIVER !== "fallback") {
    try {
      const prisma = getPrismaClient();
      await prisma.book.delete({
        where: { id: String(bookId) },
      });
      return existing;
    } catch (error) {
      if (!isDatabaseConnectionError(error)) {
        throw error;
      }
    }
  }

  const store = readFallbackStore();
  store.books = store.books.filter((item) => item.id !== String(bookId));
  store.readingProgress = store.readingProgress.filter((item) => item.bookId !== String(bookId));
  writeFallbackStore(store);
  return existing;
}

/* Executes documented symbol logic in books-repo.js. */
export async function saveReadingProgress({
  bookId,
  currentPage,
  progressPercent,
  pageCount,
  lastDevice = null,
  clientUpdatedAt = null,
  force = false,
}) {
  const book = await findBookById(bookId);
  if (!book) return null;

  const effectivePageCount =
    pageCount && Number.parseInt(pageCount, 10) > 0
      ? Math.max(1, Number.parseInt(pageCount, 10))
      : Math.max(1, book.pageCount || 1);

  const clampedPage = Math.min(
    effectivePageCount,
    Math.max(1, Number.parseInt(currentPage, 10) || 1)
  );

  const computedPercent =
    progressPercent !== undefined && progressPercent !== null && !Number.isNaN(Number(progressPercent))
      ? Math.min(100, Math.max(0, Number(progressPercent)))
      : effectivePageCount <= 1
        ? 100
        : Math.min(100, Math.max(0, Math.round((clampedPage / effectivePageCount) * 1000) / 10));

  const existingProgress = book.progress;
  if (existingProgress && !force && clientUpdatedAt) {
    const clientTime = new Date(clientUpdatedAt).getTime();
    const serverTime = new Date(existingProgress.updatedAt).getTime();
    if (!Number.isNaN(clientTime) && !Number.isNaN(serverTime) && clientTime < serverTime) {
      return {
        conflict: true,
        progress: existingProgress,
        bookPageCount: effectivePageCount,
      };
    }
  }

  if (process.env.BOOKS_DB_DRIVER !== "fallback") {
    try {
      const prisma = getPrismaClient();
      if (effectivePageCount !== book.pageCount) {
        await prisma.book.update({
          where: { id: book.id },
          data: { pageCount: effectivePageCount },
        });
      }
      const updated = await prisma.readingProgress.upsert({
        where: { bookId: book.id },
        update: {
          currentPage: clampedPage,
          progressPercent: computedPercent,
          lastDevice: lastDevice ? String(lastDevice).slice(0, 120) : undefined,
        },
        create: {
          bookId: book.id,
          currentPage: clampedPage,
          progressPercent: computedPercent,
          lastDevice: lastDevice ? String(lastDevice).slice(0, 120) : null,
        },
      });
      return {
        conflict: false,
        progress: updated,
        bookPageCount: effectivePageCount,
      };
    } catch (error) {
      if (!isDatabaseConnectionError(error)) {
        throw error;
      }
    }
  }

  const store = readFallbackStore();
  const now = new Date().toISOString();
  const bookIndex = store.books.findIndex((item) => item.id === book.id);
  if (bookIndex !== -1 && effectivePageCount !== store.books[bookIndex].pageCount) {
    store.books[bookIndex].pageCount = effectivePageCount;
    store.books[bookIndex].updatedAt = now;
  }

  const progIndex = store.readingProgress.findIndex((item) => item.bookId === book.id);
  let savedProgress;
  if (progIndex !== -1) {
    savedProgress = {
      ...store.readingProgress[progIndex],
      currentPage: clampedPage,
      progressPercent: computedPercent,
      lastDevice: lastDevice
        ? String(lastDevice).slice(0, 120)
        : store.readingProgress[progIndex].lastDevice,
      updatedAt: now,
    };
    store.readingProgress[progIndex] = savedProgress;
  } else {
    savedProgress = {
      id: `prog_${crypto.randomBytes(10).toString("hex")}`,
      bookId: book.id,
      currentPage: clampedPage,
      progressPercent: computedPercent,
      lastDevice: lastDevice ? String(lastDevice).slice(0, 120) : null,
      createdAt: now,
      updatedAt: now,
    };
    store.readingProgress.push(savedProgress);
  }

  writeFallbackStore(store);
  return {
    conflict: false,
    progress: {
      ...savedProgress,
      createdAt: new Date(savedProgress.createdAt),
      updatedAt: new Date(savedProgress.updatedAt),
    },
    bookPageCount: effectivePageCount,
  };
}
