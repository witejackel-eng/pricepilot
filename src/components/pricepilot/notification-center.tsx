'use client';

/**
 * PricePilot — Notification Center (v1.4)
 *
 * A centralized notification/activity feed that tracks all user actions
 * and system events. Derives notifications from the undoHistory in the
 * store and tracks read/unread state in component local state.
 *
 * Features:
 *   - Bell icon button with badge count of unread notifications
 *   - Pulsing animation when there are new notifications
 *   - Popover panel with scrollable list of notifications
 *   - Each notification shows icon, title, description, relative timestamp,
 *     and unread indicator
 *   - Mark all read / Clear all actions
 *   - Empty state with bell icon
 *   - Slide-in animation for new notifications
 *   - Emerald/teal color scheme
 *
 * v1.4 feature.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import type { UndoAction } from '@/store/pricepilot-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Bell,
  CheckCircle2,
  PlayCircle,
  Pencil,
  FileUp,
  Trash2,
  Settings,
  BellOff,
  CheckCheck,
  XCircle,
} from 'lucide-react';

// ── Notification types ──────────────────────────────────────────────

type NotificationType =
  | 'price-approve'
  | 'price-apply'
  | 'product-edit'
  | 'import'
  | 'product-delete'
  | 'system';

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
}

// ── Notification type metadata ──────────────────────────────────────

const NOTIFICATION_META: Record<
  NotificationType,
  {
    icon: React.ElementType;
    label: string;
    color: string;
    bg: string;
    border: string;
    dot: string;
  }
> = {
  'price-approve': {
    icon: CheckCircle2,
    label: 'Price Approved',
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-800',
    dot: 'bg-emerald-500',
  },
  'price-apply': {
    icon: PlayCircle,
    label: 'Price Applied',
    color: 'text-teal-700 dark:text-teal-300',
    bg: 'bg-teal-50 dark:bg-teal-950/30',
    border: 'border-teal-200 dark:border-teal-800',
    dot: 'bg-teal-500',
  },
  'product-edit': {
    icon: Pencil,
    label: 'Product Edited',
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  import: {
    icon: FileUp,
    label: 'Import Completed',
    color: 'text-sky-700 dark:text-sky-300',
    bg: 'bg-sky-50 dark:bg-sky-950/30',
    border: 'border-sky-200 dark:border-sky-800',
    dot: 'bg-sky-500',
  },
  'product-delete': {
    icon: Trash2,
    label: 'Product Deleted',
    color: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    dot: 'bg-red-500',
  },
  system: {
    icon: Settings,
    label: 'System',
    color: 'text-slate-700 dark:text-slate-300',
    bg: 'bg-slate-50 dark:bg-slate-800/50',
    border: 'border-slate-200 dark:border-slate-700',
    dot: 'bg-slate-400',
  },
};

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Map an UndoAction type to a NotificationType.
 * The UndoAction type is more granular; we collapse some variants.
 */
function mapUndoTypeToNotificationType(
  undoType: UndoAction['type']
): NotificationType {
  switch (undoType) {
    case 'price-approve':
    case 'bulk-approve':
      return 'price-approve';
    case 'price-apply':
      return 'price-apply';
    case 'product-edit':
      return 'product-edit';
    case 'import':
      return 'import';
    case 'product-delete':
      return 'product-delete';
    default:
      return 'system';
  }
}

/**
 * Generate a human-readable title from an UndoAction.
 */
function notificationTitleFromUndo(action: UndoAction): string {
  const type = mapUndoTypeToNotificationType(action.type);
  const meta = NOTIFICATION_META[type];
  return meta.label;
}

/**
 * Generate a description from the undo action.
 * The action.description field already contains a human-readable string.
 */
function notificationDescriptionFromUndo(action: UndoAction): string {
  return action.description;
}

/**
 * Format a timestamp as a relative time string.
 * E.g. "2m ago", "1h ago", "2d ago", "Jan 15"
 */
function formatRelativeTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';

    const now = Date.now();
    const diffMs = now - date.getTime();

    // Future timestamps (shouldn't happen but be defensive)
    if (diffMs < 0) return 'just now';

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    // Older than a week — show the date
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

// ── Component ───────────────────────────────────────────────────────

export function NotificationCenter() {
  const { undoHistory } = usePricePilotStore();
  const [open, setOpen] = useState(false);

  // Track read state per notification id. We use a Set of notification IDs
  // that have been read. Any new undoHistory entry that's not in this set
  // is considered "unread".
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // Track the last seen undoHistory length so we can detect new entries
  const prevHistoryLengthRef = useRef(undoHistory.length);

  // Build notification items from undoHistory
  const notifications = useMemo<NotificationItem[]>(() => {
    return undoHistory.map((action, index) => {
      const id = `notif-${action.timestamp}-${index}`;
      const type = mapUndoTypeToNotificationType(action.type);
      return {
        id,
        type,
        title: notificationTitleFromUndo(action),
        description: notificationDescriptionFromUndo(action),
        timestamp: action.timestamp,
        read: readIds.has(id),
      };
    });
  }, [undoHistory, readIds]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  // Mark a single notification as read
  const markAsRead = useCallback((id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(() => {
    setReadIds((prev) => {
      const next = new Set(prev);
      notifications.forEach((n) => next.add(n.id));
      return next;
    });
  }, [notifications]);

  // Clear all notifications — since we derive from undoHistory,
  // "clearing" means marking all as read and the popover will appear empty
  // only when there are no undoHistory entries. We just mark all as read.
  const clearAll = useCallback(() => {
    markAllAsRead();
    setOpen(false);
  }, [markAllAsRead]);

  // When the popover opens, we don't auto-mark-all-read so the user
  // can see which ones are new. They can manually mark all read.
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      setOpen(newOpen);
    },
    []
  );

  // When a new undoHistory entry appears while the popover is open,
  // it's automatically visible. If the popover is closed, the unread
  // count will increase.

  // ── Render ──────────────────────────────────────────────────────

  // Bell button — always visible
  const bellButton = (
    <Button
      variant="ghost"
      size="sm"
      className={`gap-1.5 h-8 px-2.5 group relative ${
        unreadCount > 0
          ? 'hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
      }`}
      title={
        unreadCount > 0
          ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
          : 'No new notifications'
      }
      aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
    >
      <div className="relative">
        <Bell
          className={`h-3.5 w-3.5 transition-colors ${
            unreadCount > 0
              ? 'text-emerald-600 dark:text-emerald-400 bell-notification-pulse'
              : 'text-slate-400 dark:text-slate-500'
          }`}
        />
        {/* Pulsing dot for unread notifications */}
        {unreadCount > 0 && (
          <>
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500" />
          </>
        )}
      </div>
      {unreadCount > 0 && (
        <Badge className="text-[10px] font-bold h-4 min-w-4 px-1 flex items-center justify-center badge-pulse bg-emerald-500 text-white">
          {unreadCount > 9 ? '9+' : unreadCount}
        </Badge>
      )}
    </Button>
  );

  // Empty state
  if (notifications.length === 0) {
    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>{bellButton}</PopoverTrigger>
        <PopoverContent
          className="w-[380px] p-0"
          align="end"
          sideOffset={8}
        >
          {/* Header */}
          <div className="bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 p-4 text-white rounded-t-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Notifications</h3>
                  <p className="text-xs text-emerald-50/90">Activity feed</p>
                </div>
              </div>
            </div>
          </div>

          {/* Empty state */}
          <div className="p-8 text-center">
            <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
              <BellOff className="h-6 w-6 text-slate-400 dark:text-slate-500" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              No notifications yet
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Actions like approving prices, editing products, and importing
              data will appear here.
            </p>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{bellButton}</PopoverTrigger>
      <PopoverContent
        className="w-[400px] p-0"
        align="end"
        sideOffset={8}
      >
        {/* Header with gradient */}
        <div className="bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 p-4 text-white rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Bell className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Notifications</h3>
                <p className="text-xs text-emerald-50/90">
                  {unreadCount > 0
                    ? `${unreadCount} unread`
                    : 'All caught up'}
                </p>
              </div>
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] px-2 text-white/90 hover:text-white hover:bg-white/20"
                onClick={markAllAsRead}
                aria-label="Mark all notifications as read"
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </div>

        {/* Notification list */}
        <ScrollArea className="max-h-[400px]">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.map((notification, idx) => {
              const meta = NOTIFICATION_META[notification.type];
              const Icon = meta.icon;
              return (
                <div
                  key={notification.id}
                  className={`px-3 py-2.5 transition-colors duration-200 ${
                    notification.read
                      ? 'bg-white dark:bg-slate-950'
                      : `${meta.bg} hover:bg-opacity-70`
                  } animate-slide-in`}
                  style={{ animationDelay: `${idx * 30}ms` }}
                  onClick={() => markAsRead(notification.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      markAsRead(notification.id);
                    }
                  }}
                  aria-label={`${notification.title}: ${notification.description}`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Type icon */}
                    <div
                      className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${meta.bg} border ${meta.border}`}
                    >
                      <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                          {notification.title}
                        </span>
                        {/* Unread dot indicator */}
                        {!notification.read && (
                          <span
                            className={`h-2 w-2 rounded-full flex-shrink-0 ${meta.dot} dot-pulse`}
                            aria-label="Unread"
                          />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                        {notification.description}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 tabular-nums">
                        {formatRelativeTime(notification.timestamp)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Footer */}
        <Separator />
        <div className="p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-b-lg">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs h-8 hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400"
            onClick={clearAll}
            aria-label="Clear all notifications"
          >
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            Clear all
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
