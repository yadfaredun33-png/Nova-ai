import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Cpu, Shield, Activity, RefreshCcw, Layers, FolderOpen, 
  FileText, X, Trash2, Save, Terminal as TerminalIcon, 
  Plus, Menu, Download, Eye, Globe, MessageSquare, PlusCircle,
  Copy, Check
} from 'lucide-react';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { llmService, type Message, type WorkspaceFile, type NovaStatus } from './services/llmService';
import { cn } from '@/src/lib/utils';

interface UserSession {
  id: string;
  name: string;
  createdAt: number;
}

export default function App() {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<NovaStatus>('idle');
  const [activeTab, setActiveTab] = useState<'telemetry' | 'workspace' | 'preview'>('telemetry');
  const [previewData, setPreviewData] = useState<{ code: string; title: string }>({
    code: '',
    title: 'No Active Build'
  });
  const [workspace, setWorkspace] = useState<WorkspaceFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  // Initial load
  useEffect(() => {
    fetchSessions();
  }, []);

  // Load session data when changed
  useEffect(() => {
    if (currentSessionId) {
      fetchMessages(currentSessionId);
      fetchWorkspace(currentSessionId);
    }
  }, [currentSessionId]);

  const fetchSessions = async () => {
    const res = await fetch('/api/sessions');
    const data = await res.json();
    setSessions(data);
    if (data.length > 0 && !currentSessionId) {
      setCurrentSessionId(data[0].id);
    } else if (data.length === 0) {
      createNewSession();
    }
  };

  const createNewSession = async () => {
    const id = Date.now().toString();
    const name = `Session ${sessions.length + 1}`;
    await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name })
    });
    fetchSessions();
    setCurrentSessionId(id);
    setMessages([]);
    setWorkspace([]);
  };

  const fetchMessages = async (id: string) => {
    const res = await fetch(`/api/sessions/${id}/messages`);
    const data = await res.json();
    setMessages(data.length > 0 ? data : [{
      role: 'assistant',
      content: 'System initialized. Neural memory loaded from SQL cluster.',
      id: 'init',
      timestamp: Date.now()
    }]);
  };

  const fetchWorkspace = async (id: string) => {
    const res = await fetch(`/api/sessions/${id}/files`);
    const data = await res.json();
    setWorkspace(data);
  };

  const saveMessage = async (msg: Message) => {
    if (!currentSessionId) return;
    await fetch(`/api/sessions/${currentSessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg)
    });
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleToolCall = useCallback(async (calls: any[]) => {
    const results = [];
    if (!currentSessionId) return [];

    for (const call of calls) {
      const { name, args } = call;
      if (name === 'listFiles') {
        results.push({ name, response: { files: workspace.map(f => f.name) } });
      } else if (name === 'readFile') {
        const file = workspace.find(f => f.name === args.filename);
        results.push({ name, response: file ? { content: file.content } : { error: 'File not found' } });
      } else if (name === 'writeFile') {
        await fetch(`/api/sessions/${currentSessionId}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: args.filename, content: args.content })
        });
        fetchWorkspace(currentSessionId);
        results.push({ name, response: { success: true } });
      } else if (name === 'deleteFile') {
        await fetch(`/api/sessions/${currentSessionId}/files/${args.filename}`, {
          method: 'DELETE'
        });
        fetchWorkspace(currentSessionId);
        results.push({ name, response: { success: true } });
      } else if (name === 'setLivePreview') {
        setPreviewData({ code: args.code, title: args.title || 'Live Preview' });
        setActiveTab('preview');
        results.push({ name, response: { success: true, status: 'Deployed' } });
      }
    }
    return results;
  }, [currentSessionId, workspace]);

  const handleSend = async (content: string) => {
    if (!currentSessionId) return;

    const userMessage: Message = {
      role: 'user',
      content,
      id: Date.now().toString(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    saveMessage(userMessage);
    setIsLoading(true);

    const assistantId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      role: 'assistant',
      content: '',
      id: assistantId,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, assistantMessage]);

    try {
      let accumulatedContent = '';
      const stream = llmService.chat([...messages, userMessage], {
        onToolCall: handleToolCall,
        onStatusChange: (s) => setStatus(s)
      });
      for await (const chunk of stream) {
        accumulatedContent += chunk;
        setMessages(prev => prev.map(msg => 
          msg.id === assistantId ? { ...msg, content: accumulatedContent } : msg
        ));
      }
      saveMessage({ ...assistantMessage, content: accumulatedContent });
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsLoading(false);
      setStatus('idle');
    }
  };

  const removeSession = async (id: string) => {
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    fetchSessions();
    if (currentSessionId === id) setCurrentSessionId(null);
  };

  const saveFile = async () => {
    if (selectedFile && currentSessionId) {
      await fetch(`/api/sessions/${currentSessionId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selectedFile.name, content: editContent })
      });
      fetchWorkspace(currentSessionId);
      setIsEditing(false);
    }
  };

  const downloadFile = (file: WorkspaceFile) => {
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex h-screen bg-[#0A0A0B] overflow-hidden relative text-slate-200">
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSidebarOpen(false)} className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30" />
        )}
      </AnimatePresence>

      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-72 lg:static flex border-r border-slate-800 flex-col bg-[#050505] transition-transform duration-300 transform lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3 text-blue-500 mb-2">
            <Cpu size={24} />
            <h1 className="font-mono font-bold tracking-tighter text-lg text-slate-100">NOVA-1</h1>
          </div>
          <button 
            onClick={createNewSession}
            className="w-full flex items-center justify-between px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-mono font-bold transition-all shadow-lg shadow-blue-500/20"
          >
            <span className="flex items-center gap-2"><PlusCircle size={14} /> New Brain</span>
            <span className="text-[10px] opacity-50">#SQL</span>
          </button>
        </div>

        <div className="flex border-b border-slate-800">
          <button onClick={() => setActiveTab('telemetry')} className={`flex-1 py-3 text-[10px] font-mono uppercase tracking-widest transition-colors ${activeTab === 'telemetry' ? 'text-blue-400 border-b border-blue-400' : 'text-slate-600 hover:text-slate-400'}`}>Telemetry</button>
          <button onClick={() => setActiveTab('workspace')} className={`flex-1 py-3 text-[10px] font-mono uppercase tracking-widest transition-colors ${activeTab === 'workspace' ? 'text-blue-400 border-b border-blue-400' : 'text-slate-600 hover:text-slate-400'}`}>Files</button>
          <button onClick={() => setActiveTab('preview')} className={`flex-1 py-3 text-[10px] font-mono uppercase tracking-widest transition-colors ${activeTab === 'preview' ? 'text-blue-400 border-b border-blue-400' : 'text-slate-600 hover:text-slate-400'}`}>Preview</button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'telemetry' && (
            <div className="p-4 space-y-6">
              <div className="space-y-4">
                <h2 className="px-2 text-[10px] font-mono text-slate-600 uppercase tracking-widest mb-4">Nova API Node</h2>
                
                <div className="p-3 bg-blue-500/5 rounded-lg border border-blue-500/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-mono text-blue-400 font-bold uppercase">External Endpoint (POST)</p>
                    <Shield size={10} className="text-blue-400" />
                  </div>
                  <div className="p-2 bg-black/40 rounded border border-slate-800 flex items-center justify-between group">
                    <code className="text-[9px] font-mono text-slate-400 truncate pr-2">{window.location.origin}/api/external/chat</code>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/api/external/chat`);
                        alert('Copied to clipboard');
                      }}
                      className="text-slate-600 hover:text-blue-400 transition-colors"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[10px] font-mono text-blue-400 font-bold uppercase">Quick Test (GET)</p>
                    <Globe size={10} className="text-blue-400" />
                  </div>
                  <div className="p-2 bg-black/40 rounded border border-slate-800 flex items-center justify-between group">
                    <code className="text-[9px] font-mono text-slate-400 truncate pr-2">{window.location.origin}/api/external/ask?key=...&prompt=...</code>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/api/external/ask?key=YOUR_KEY&prompt=Hello`);
                        alert('Template copied');
                      }}
                      className="text-slate-600 hover:text-blue-400 transition-colors"
                    >
                      <Copy size={12} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <p className="text-[9px] font-mono text-slate-600">Header: <span className="text-slate-400">x-nova-api-key</span></p>
                    <div className="flex items-center gap-1.5 focus-within:ring-0">
                      <div className="h-1 w-1 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[8px] font-mono text-green-500/60 uppercase">CORS: ENABLED</span>
                    </div>
                  </div>
                </div>
                
                <div className="px-2 py-2 bg-slate-900/50 rounded border border-slate-800/50">
                  <p className="text-[9px] font-mono text-slate-500 leading-tight">
                    <Globe size={8} className="inline mr-1" />
                    <strong>Note:</strong> When using the "Shared App" (PRE) URL, ensure your requests target that origin.
                  </p>
                  <p className="text-[8px] font-mono text-blue-400/60 mt-1 uppercase tracking-tighter">
                    Status 404? Click 'Share' in AI Studio again to deploy the latest API routes.
                  </p>
                </div>
                
                <p className="px-2 text-[9px] font-mono text-slate-700 leading-tight">
                  <Shield size={8} className="inline mr-1" />
                  Configure <code className="text-slate-500">NOVA_API_KEY</code> in project secrets to authorize your other apps.
                </p>

                <div className="px-2 py-4 border-t border-slate-800/50 mt-6">
                  <h2 className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mb-4">Saved Instances</h2>
                  <div className="space-y-1">
                    {sessions.map(s => (
                      <div key={s.id} className="group relative">
                        <button 
                          onClick={() => { setCurrentSessionId(s.id); setIsSidebarOpen(false); }}
                          className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-mono transition-all", currentSessionId === s.id ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:bg-slate-800/30")}
                        >
                          <MessageSquare size={14} />
                          <span className="truncate">{s.name}</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); removeSession(s.id); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400"><Trash2 size={12} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'workspace' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between px-2 mb-4">
                <h2 className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">Workspace Objects</h2>
                <span className="text-[10px] font-mono text-slate-700">{workspace.length}</span>
              </div>
              <div className="space-y-1">
                {workspace.map((file) => (
                  <div key={file.name} className="group relative">
                    <button onClick={() => { setSelectedFile(file); setEditContent(file.content); setIsSidebarOpen(false); }} className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-mono transition-all", selectedFile?.name === file.name ? "bg-blue-500/10 text-blue-400" : "text-slate-500 hover:bg-slate-800/50 hover:text-slate-300")}>
                      <FileText size={14} />
                      <span className="truncate">{file.name}</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="p-4 h-full flex flex-col">
              <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden flex flex-col">
                <div className="h-8 bg-slate-800/50 border-b border-slate-800 flex items-center px-4 gap-2">
                  <Globe size={12} className="text-slate-500" />
                  <span className="text-[9px] font-mono text-slate-400 truncate tracking-tight">{previewData.title}</span>
                </div>
                <iframe title="Nova Live Preview" srcDoc={previewData.code || '<html><body style="background:#0F172A; display:flex; align-items:center; justify-content:center; height:100vh; color:#94A3B8; font-family:sans-serif; text-align:center;"><div><h3>No Build Active</h3><p>Trigger a preview via chat.</p></div></body></html>'} className="flex-1 w-full border-none bg-white" />
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-800 text-[9px] font-mono text-slate-700 leading-relaxed uppercase tracking-tighter">
          Kernel: v2.5.0-SQL-Persistent<br />
          Host: Internal Engine
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 relative">
        <AnimatePresence>
          {selectedFile && (
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="absolute inset-0 z-40 bg-[#0A0A0B] flex flex-col border-l border-slate-800">
              <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded bg-blue-500/10 text-blue-400"><FileText size={18} /></div>
                  <div>
                    <h3 className="text-sm font-mono font-bold">{selectedFile.name}</h3>
                    <p className="text-[9px] font-mono text-slate-500 uppercase">{isEditing ? "Editing System Data" : "Object Preview"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => downloadFile(selectedFile)} className="p-2 text-slate-500 hover:text-blue-400"><Download size={20} /></button>
                  <div className="w-px h-4 bg-slate-800 mx-1" />
                  {isEditing ? (
                    <button onClick={saveFile} className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-[10px] font-mono font-bold"><Save size={12} className="inline mr-2" /> Save</button>
                  ) : (
                    <button onClick={() => setIsEditing(true)} className="px-3 py-1.5 rounded-lg border border-slate-800 text-slate-400 text-[10px] font-mono">Edit</button>
                  )}
                  <button onClick={() => { setSelectedFile(null); setIsEditing(false); }} className="p-2 text-slate-500"><X size={20} /></button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                {isEditing ? (
                  <textarea autoFocus value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full h-full bg-transparent p-6 font-mono text-sm resize-none focus:outline-none" />
                ) : (
                  <div className="p-6 overflow-y-auto h-full"><pre className="font-mono text-sm whitespace-pre-wrap">{selectedFile.content}</pre></div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <header className="h-16 border-b border-slate-800 bg-[#0A0A0B]/50 backdrop-blur-md flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-slate-100 transition-colors"><Menu size={20} /></button>
            <div className="flex flex-col">
              <span className="text-sm font-mono font-bold tracking-tight">Nova Architect v2.5</span>
              <div className="flex items-center gap-2 h-4">
                {status !== 'idle' ? (
                  <span className="text-[10px] font-mono text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                    <RefreshCcw size={10} className="animate-spin" />
                    Nova is {status}...
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-green-500/80 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-green-500 animate-pulse" />
                    Engine Ready
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-[10px] font-mono text-slate-500 bg-slate-800/30 px-3 py-1 rounded border border-slate-800 hover:text-blue-400 cursor-help" title="X-NOVA-API-KEY: Injected">API Connection Active</div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
          <div className="max-w-4xl mx-auto">
            <AnimatePresence mode="popLayout">
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
            </AnimatePresence>
            {isLoading && messages.length > 0 && messages[messages.length - 1].content === '' && (
              <div className="p-6 flex gap-4 animate-pulse">
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center"><TerminalIcon size={18} /></div>
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-2 bg-slate-800 rounded w-1/4"></div>
                  <div className="h-2 bg-slate-800 rounded w-3/4"></div>
                </div>
              </div>
            )}
          </div>
        </div>

        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </main>
    </div>
  );
}
