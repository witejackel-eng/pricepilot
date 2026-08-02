'use client';

import { useState, useMemo } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StickyNote, Plus, Trash2, X, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

const MAX_NOTE_LENGTH = 500;

interface ProductNotesPanelProps {
  productId: string;
}

export function ProductNotesPanel({ productId }: ProductNotesPanelProps) {
  const { productNotes, addProductNote, deleteProductNote } = usePricePilotStore();
  const [isAdding, setIsAdding] = useState(false);
  const [noteText, setNoteText] = useState('');

  // Filter notes for this product, sorted newest first
  const notes = useMemo(
    () => productNotes
      .filter(n => n.productId === productId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [productNotes, productId]
  );

  const charCount = noteText.length;
  const isOverLimit = charCount > MAX_NOTE_LENGTH;

  const handleSave = async () => {
    const trimmed = noteText.trim();
    if (!trimmed) {
      toast.error('Note cannot be empty');
      return;
    }
    if (isOverLimit) {
      toast.error(`Note exceeds ${MAX_NOTE_LENGTH} character limit`);
      return;
    }
    await addProductNote(productId, trimmed);
    setNoteText('');
    setIsAdding(false);
    toast.success('Note added');
  };

  const handleCancel = () => {
    setNoteText('');
    setIsAdding(false);
  };

  const handleDelete = async (noteId: string) => {
    await deleteProductNote(noteId);
    toast.success('Note deleted');
  };

  const formatTimestamp = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-4">
      {/* Add Note Button / Input Area */}
      {!isAdding ? (
        <Button
          onClick={() => setIsAdding(true)}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md font-semibold note-pulse"
        >
          <Plus className="h-4 w-4 mr-2" /> Add Note
        </Button>
      ) : (
        <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-emerald-50/20 animate-fade-in">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-semibold text-slate-700">New Note</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                className="h-7 w-7 p-0 rounded-lg hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative">
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note about this product (e.g., supplier info, special pricing considerations, reminders)..."
                className="min-h-[100px] resize-none rounded-xl border-2 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all bg-white/80"
                maxLength={MAX_NOTE_LENGTH + 10}
              />
              <div className={`text-xs mt-1 text-right ${
                isOverLimit ? 'text-red-500 font-semibold' : charCount > MAX_NOTE_LENGTH * 0.9 ? 'text-amber-600' : 'text-slate-400'
              }`}>
                {charCount}/{MAX_NOTE_LENGTH}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={handleCancel}
                className="rounded-lg border-slate-200 shadow-sm hover:bg-slate-50"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!noteText.trim() || isOverLimit}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <StickyNote className="h-4 w-4 mr-1" /> Save Note
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes List */}
      {notes.length === 0 ? (
        <Card className="shadow-sm rounded-xl border border-dashed border-emerald-200 bg-emerald-50/20">
          <CardContent className="p-6 text-center">
            <MessageSquare className="h-10 w-10 text-emerald-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600 mb-1">No notes yet</p>
            <p className="text-xs text-slate-400">
              Add notes to track supplier info, special pricing considerations, or reminders for this product.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notes.map((note, index) => (
            <Card
              key={note.id}
              className="note-slide-in shadow-sm rounded-xl border border-slate-100 dark:border-slate-800 bg-gradient-to-r from-white to-emerald-50/5 hover:shadow-md transition-shadow"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Left border accent via pseudo-element */}
                    <div className="border-l-3 border-emerald-400 pl-3">
                      <p className="text-sm text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
                        {note.text}
                      </p>
                      <p className="text-xs text-slate-400 mt-2">
                        {formatTimestamp(note.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(note.id)}
                    className="h-7 w-7 p-0 rounded-lg hover:bg-red-50 hover:text-red-600 text-slate-400 shrink-0 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProductNotesPanel;
