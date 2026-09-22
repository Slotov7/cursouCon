import { useEffect, useState, useRef, type ReactElement } from "react";
import {
  IconExplore,
  IconMaterials,
  IconPlan,
  IconPractice,
  IconProgress,
  IconToday,
} from "./primitives";

type ViewId = "today" | "plan" | "materials" | "practice" | "progress" | "explore";

type CommandItem = {
  id: string;
  label: string;
  category: "Navegação" | "Ação Rápida" | "Preferências";
  shortcut?: string;
  icon: (props: { className?: string }) => ReactElement;
  perform: () => void;
};

type CommandPaletteProps = {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: ViewId) => void;
  onToggleTheme: () => void;
};

export function CommandPalette({ isOpen, onClose, onNavigate, onToggleTheme }: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = [
    {
      id: "nav-today",
      label: "Ir para 'Hoje' (Painel do Dia)",
      category: "Navegação",
      shortcut: "G H",
      icon: IconToday,
      perform: () => {
        onNavigate("today");
        onClose();
      },
    },
    {
      id: "nav-plan",
      label: "Ir para 'Plano & Edital' (Disciplinas)",
      category: "Navegação",
      shortcut: "G P",
      icon: IconPlan,
      perform: () => {
        onNavigate("plan");
        onClose();
      },
    },
    {
      id: "nav-materials",
      label: "Ir para 'Materiais' (Biblioteca de PDFs)",
      category: "Navegação",
      shortcut: "G M",
      icon: IconMaterials,
      perform: () => {
        onNavigate("materials");
        onClose();
      },
    },
    {
      id: "nav-practice",
      label: "Ir para 'Praticar Questões'",
      category: "Navegação",
      shortcut: "G Q",
      icon: IconPractice,
      perform: () => {
        onNavigate("practice");
        onClose();
      },
    },
    {
      id: "nav-progress",
      label: "Ir para 'Evolução & Desempenho'",
      category: "Navegação",
      shortcut: "G E",
      icon: IconProgress,
      perform: () => {
        onNavigate("progress");
        onClose();
      },
    },
    {
      id: "action-theme",
      label: "Alternar Tema Claro / Escuro",
      category: "Preferências",
      shortcut: "Alt + T",
      icon: IconExplore,
      perform: () => {
        onToggleTheme();
        onClose();
      },
    },
  ];

  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(search.toLowerCase()) ||
      cmd.category.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].perform();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-950/70 backdrop-blur-md transition-opacity duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-card/95 backdrop-blur-xl shadow-2xl transition-all duration-150 ease-out ring-1 ring-black/5 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input Header */}
        <div className="flex items-center border-b border-line px-4 py-3.5">
          <svg className="size-4.5 text-blue-500 shrink-0 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Digite um comando ou busque uma tela..."
            className="w-full bg-transparent text-sm font-medium text-ink placeholder:text-muted focus:outline-none"
          />
          <kbd className="rounded-md border border-line bg-paper px-2 py-0.5 text-[10px] font-mono text-muted font-semibold">ESC</kbd>
        </div>

        {/* Command List */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted">Nenhum comando encontrado para "{search}".</p>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              const IconComponent = cmd.icon;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={cmd.perform}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold cursor-pointer transition-all duration-100 ease-out active:scale-[0.99] ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-xs font-bold"
                      : "text-ink hover:bg-paper"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <IconComponent className={`size-4.5 shrink-0 ${isSelected ? "text-white" : "text-muted"}`} />
                    <span className="truncate">{cmd.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-medium uppercase tracking-wider ${isSelected ? "text-white/80" : "text-muted"}`}>
                      {cmd.category}
                    </span>
                    {cmd.shortcut && (
                      <kbd className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold ${isSelected ? "bg-white/20 text-white" : "bg-paper border border-line text-muted"}`}>
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between border-t border-line bg-paper/60 px-4 py-2.5 text-[11px] text-muted">
          <div className="flex items-center gap-3">
            <span><kbd className="font-mono font-semibold">↑↓</kbd> Navegar</span>
            <span><kbd className="font-mono font-semibold">↵</kbd> Executar</span>
          </div>
          <span className="font-mono text-[10px]">CursouCon Desktop</span>
        </div>
      </div>
    </div>
  );
}
