import { useState, useRef, useEffect } from 'react';
import { SendHorizontal, Terminal } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim() && !isLoading) {
      onSend(input);
      setInput('');
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-slate-800 bg-[#0A0A0B]/80 backdrop-blur-xl p-4">
      <div className="max-w-4xl mx-auto relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
          <Terminal size={18} className={isLoading ? "animate-pulse " : ""} />
        </div>
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Initialize request..."
            className="w-full bg-[#151619] border border-slate-800 rounded-xl py-3 pl-12 pr-12 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 resize-none transition-all"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-blue-500 hover:bg-blue-500/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <SendHorizontal size={20} />
          </button>
        </form>
        <div className="mt-2 flex justify-between items-center text-[10px] font-mono uppercase tracking-widest text-slate-600">
          <span>Environment: Sandbox v2.5 SQL</span>
          <span className="flex items-center gap-2">
            <span className={cn("h-1.5 w-1.5 rounded-full", isLoading ? "bg-blue-500 animate-pulse" : "bg-slate-700")} />
            Status: {isLoading ? "Synching..." : "Ready"}
          </span>
        </div>
      </div>
    </div>
  );
}
