import { FileText } from 'lucide-react';
import type { Attachment } from '@/domain/types';
import { formatDateTime } from '@/shared/utils/format';
import { useToast } from './Toast';

/** Uploaded document chip. Files are stored by the backend; the prototype only keeps metadata. */
export function AttachmentChip({ file }: { file: Attachment }) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        toast({
          title: file.fileName,
          body: 'Documents are stored and served by the AENIX backend (not in the prototype).',
        })
      }
      className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left hover:bg-canvas"
    >
      <FileText aria-hidden="true" className="size-4 shrink-0 text-brand" />
      <span className="min-w-0">
        <span className="block truncate text-body-s font-medium">{file.fileName}</span>
        <span className="block text-caption text-fg-muted">
          {file.sizeKb} KB · {file.uploadedBy} · {formatDateTime(file.uploadedAt)}
        </span>
      </span>
    </button>
  );
}
