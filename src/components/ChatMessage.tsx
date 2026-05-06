import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { Bot, User } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import type { Message } from '@/src/services/llmService';

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isAssistant = message.role === 'assistant';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex w-full gap-4 p-6",
        isAssistant ? "bg-[#151619]/50" : "bg-transparent"
      )}
    >
      <div className={cn(
        "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border",
        isAssistant 
          ? "bg-blue-500/10 border-blue-500/20 text-blue-400" 
          : "bg-slate-500/10 border-slate-500/20 text-slate-400"
      )}>
        {isAssistant ? <Bot size={18} /> : <User size={18} />}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono font-medium tracking-wider uppercase opacity-50">
            {isAssistant ? "Nova-1" : "User"}
          </span>
          <span className="text-[10px] opacity-20 font-mono">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        
        <div className="markdown-body">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      </div>
    </motion.div>
  );
}
