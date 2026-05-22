"use client";

import { useState, useEffect, useRef } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { Quote } from "@/lib/types";
import {
  PIPELINE_STAGES,
  STAGE_CONFIG,
  PipelineStage,
  isOverdue,
  quoteStage,
} from "@/lib/pipeline";
import QuoteCard from "@/components/QuoteCard";

interface Props {
  quotes: Quote[];
  onQuoteClick: (quote: Quote) => void;
  onUpdate: (updated: Quote) => void;
  showConverted?: boolean;
}

function sortCards(cards: Quote[]): Quote[] {
  return [...cards].sort((a, b) => {
    // Overdue follow-ups first (active stages only)
    const aOverdue = isOverdue(a.follow_up_date) ? 0 : 1;
    const bOverdue = isOverdue(b.follow_up_date) ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;

    // Then by follow_up_date ascending (null last)
    if (a.follow_up_date && b.follow_up_date) {
      if (a.follow_up_date < b.follow_up_date) return -1;
      if (a.follow_up_date > b.follow_up_date) return 1;
    } else if (a.follow_up_date) return -1;
    else if (b.follow_up_date) return 1;

    // Then by created_at ascending
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

export default function QuotePipelineBoard({ quotes, onQuoteClick, onUpdate, showConverted = true }: Props) {
  // Local copy for optimistic updates during drag
  const [localQuotes, setLocalQuotes] = useState<Quote[]>(quotes ?? []);
  // Track whether we currently have a pending PATCH (prevents parent sync overwriting optimistic state)
  const pendingIds = useRef<Set<string>>(new Set());

  // Sync from parent when quotes change, but skip IDs with pending updates
  useEffect(() => {
    setLocalQuotes((prev) => {
      // Merge: take server data for all quotes without pending updates
      const merged = (quotes ?? []).map((q) => {
        if (pendingIds.current.has(q.id)) {
          // Keep our optimistic version
          return prev.find((p) => p.id === q.id) ?? q;
        }
        return q;
      });
      return merged;
    });
  }, [quotes]);

  // Hide converted quotes unless showConverted is true
  const visibleQuotes = localQuotes.filter(
    (q) => showConverted || q.status !== "converted"
  );

  // Debug: log what the board receives so Vercel / browser console shows the count
  console.log(
    "[QuotePipelineBoard] total:", localQuotes.length,
    "| visible:", visibleQuotes.length,
    "| statuses:", Array.from(new Set(localQuotes.map((q) => q.status))).join(", ") || "none"
  );

  async function handleDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    const newStage = destination.droppableId as PipelineStage;

    // ── Optimistic update ────────────────────────────────────────────────────
    pendingIds.current.add(draggableId);
    setLocalQuotes((prev) =>
      prev.map((q) =>
        q.id === draggableId ? { ...q, status: newStage } : q
      )
    );

    // ── PATCH ────────────────────────────────────────────────────────────────
    try {
      const res = await fetch(`/api/quotes/${draggableId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStage }),
      });

      if (res.ok) {
        const json = (await res.json()) as { quote: Quote };
        setLocalQuotes((prev) =>
          prev.map((q) => (q.id === draggableId ? json.quote : q))
        );
        onUpdate(json.quote);
      } else {
        // Revert on server error
        setLocalQuotes(quotes ?? []);
      }
    } catch {
      // Revert on network error
      setLocalQuotes(quotes ?? []);
    } finally {
      pendingIds.current.delete(draggableId);
    }
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 16, minHeight: '60vh', alignItems: 'flex-start' }}>
        {PIPELINE_STAGES.map((stage) => {
          const config = STAGE_CONFIG[stage];
          const cards = sortCards(
            visibleQuotes.filter((q) => quoteStage(q.status) === stage)
          );
          const overdueCount = cards.filter(
            (q) =>
              isOverdue(q.follow_up_date) &&
              stage !== "job_won" &&
              stage !== "job_lost"
          ).length;

          return (
            <div
              key={stage}
              style={{ flexShrink: 0, width: 256, display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden', border: '1px solid #E8E8F0' }}
            >
              {/* Column header */}
              <div
                style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: config.color }}
              >
                <span style={{ color: '#fff', fontWeight: 600, fontSize: 13, letterSpacing: '0.02em' }}>
                  {config.label}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {overdueCount > 0 && (
                    <span style={{ background: 'rgba(255,255,255,0.3)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 6px' }}>
                      {overdueCount} overdue
                    </span>
                  )}
                  <span style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 8px' }}>
                    {cards.length}
                  </span>
                </div>
              </div>

              {/* Droppable card area */}
              <Droppable droppableId={stage}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200, background: snapshot.isDraggingOver ? '#EEF2FF' : '#F9FAFB', transition: 'background 0.15s' }}
                  >
                    {cards.length === 0 && !snapshot.isDraggingOver && (
                      <p style={{ fontSize: 12, color: '#D1D5DB', textAlign: 'center', paddingTop: 24, fontStyle: 'italic', userSelect: 'none' }}>
                        No quotes
                      </p>
                    )}

                    {cards.map((q, index) => (
                      <Draggable key={q.id} draggableId={q.id} index={index}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            style={{
                              ...dragProvided.draggableProps.style,
                              transition: 'box-shadow 0.15s',
                              borderRadius: 10,
                              boxShadow: dragSnapshot.isDragging ? '0 8px 24px rgba(0,0,0,0.12)' : undefined,
                              transform: dragSnapshot.isDragging ? `${dragProvided.draggableProps.style?.transform ?? ''} rotate(1deg)` : undefined,
                              opacity: q.status === "converted" ? 0.6 : 1,
                            }}
                          >
                            <QuoteCard
                              quote={q}
                              onClick={() => onQuoteClick(q)}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}

                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
