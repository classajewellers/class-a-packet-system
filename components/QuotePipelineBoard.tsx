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

export default function QuotePipelineBoard({ quotes, onQuoteClick, onUpdate, showConverted = false }: Props) {
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
      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[60vh] items-start">
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
              className="flex-shrink-0 w-64 flex flex-col rounded-2xl overflow-hidden border border-gray-200 shadow-sm"
            >
              {/* Column header */}
              <div
                className="px-3 py-2.5 flex items-center justify-between flex-shrink-0"
                style={{ backgroundColor: config.color }}
              >
                <span className="text-white font-semibold text-sm tracking-wide">
                  {config.label}
                </span>
                <div className="flex items-center gap-1.5">
                  {overdueCount > 0 && (
                    <span className="bg-white/30 text-white text-xs font-bold rounded-full px-1.5 py-0.5">
                      {overdueCount} overdue
                    </span>
                  )}
                  <span className="bg-white/20 text-white text-xs font-bold rounded-full px-2 py-0.5">
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
                    className={`flex-1 p-2 space-y-2 min-h-[200px] transition-colors duration-150 ${
                      snapshot.isDraggingOver
                        ? "bg-gray-100 ring-2 ring-inset ring-gray-300"
                        : "bg-gray-50"
                    }`}
                  >
                    {cards.length === 0 && !snapshot.isDraggingOver && (
                      <p className="text-xs text-gray-400 text-center pt-6 italic select-none">
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
                            style={dragProvided.draggableProps.style}
                            className={`transition-shadow duration-150 rounded-xl ${
                              dragSnapshot.isDragging
                                ? "shadow-2xl ring-2 ring-black/10 rotate-1 scale-[1.02]"
                                : ""
                            } ${q.status === "converted" ? "opacity-40 grayscale" : ""}`}
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
