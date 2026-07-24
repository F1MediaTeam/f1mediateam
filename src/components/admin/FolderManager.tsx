"use client";

// Subfolder controls for one level of the document library: the "New folder"
// button, the clickable subfolder rows, and per-folder rename / delete.
//
// Navigation is by link (?folder=<scope>&dir=<folderId>) so the page itself
// stays a server component; only these controls are interactive.

import { useState, useTransition } from "react";
import Link from "next/link";
import { Folder, FolderPlus, Pencil, Trash2, Check, X } from "lucide-react";
import {
  createFolderAction,
  renameFolderAction,
  deleteFolderAction,
} from "@/app/admin/document-actions";
import type { DocumentFolder } from "@/lib/types";

export default function FolderManager({
  scope,
  parentId,
  subfolders,
}: {
  /** "f1" or a client id */
  scope: string;
  /** the folder we're currently inside, or null at the scope root */
  parentId: string | null;
  /** immediate children of the current folder */
  subfolders: DocumentFolder[];
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [, startTransition] = useTransition();

  function create() {
    const name = newName.trim();
    if (!name) return;
    startTransition(() => {
      void createFolderAction(scope, parentId, name);
    });
    setNewName("");
    setAdding(false);
  }

  function saveRename(id: string) {
    const name = editName.trim();
    if (name) startTransition(() => void renameFolderAction(id, name));
    setEditingId(null);
  }

  function remove(f: DocumentFolder) {
    if (!confirm(`Delete the folder "${f.name}"? Files inside move to the top of this folder — they aren't deleted.`))
      return;
    startTransition(() => void deleteFolderAction(f.id));
  }

  const href = (dir: string) => `/admin/documents?folder=${scope}&dir=${dir}`;

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
          Folders
        </span>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"
        >
          <FolderPlus size={13} /> New folder
        </button>
      </div>

      {adding ? (
        <div className="mb-2 flex items-center gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Folder name"
            className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2.5 py-1.5 text-sm"
          />
          <button type="button" onClick={create} className="rounded-lg p-1.5 text-[var(--color-accent)] hover:bg-[var(--color-bg-hover)]">
            <Check size={16} />
          </button>
          <button type="button" onClick={() => setAdding(false)} className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]">
            <X size={16} />
          </button>
        </div>
      ) : null}

      {subfolders.length === 0 && !adding ? (
        <p className="text-xs text-[var(--color-text-subtle)]">No subfolders here.</p>
      ) : (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {subfolders.map((f) =>
            editingId === f.id ? (
              <div key={f.id} className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2.5 py-2">
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRename(f.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="min-w-0 flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
                />
                <button type="button" onClick={() => saveRename(f.id)} className="p-1 text-[var(--color-accent)]">
                  <Check size={15} />
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="p-1 text-[var(--color-text-muted)]">
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div
                key={f.id}
                className="group flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2.5 py-2 hover:border-[var(--color-border-strong)]"
              >
                <Link href={href(f.id)} className="flex min-w-0 flex-1 items-center gap-2">
                  <Folder size={15} className="shrink-0 text-[var(--color-accent)]" />
                  <span className="truncate text-sm">{f.name}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(f.id);
                    setEditName(f.name);
                  }}
                  title="Rename"
                  className="p-1 text-[var(--color-text-subtle)] opacity-0 transition hover:text-[var(--color-text)] group-hover:opacity-100"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(f)}
                  title="Delete folder"
                  className="p-1 text-[var(--color-text-subtle)] opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
