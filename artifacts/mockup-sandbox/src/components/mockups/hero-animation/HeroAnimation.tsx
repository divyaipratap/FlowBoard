import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, MoreHorizontal, Link2, CheckCircle2, CircleDashed, Clock } from 'lucide-react';
import './_group.css';

const USERS = [
  { id: 'u1', initials: 'JD', color: 'bg-purple-500', border: 'border-purple-400/30' },
  { id: 'u2', initials: 'AL', color: 'bg-teal-500', border: 'border-teal-400/30' },
  { id: 'u3', initials: 'MK', color: 'bg-orange-500', border: 'border-orange-400/30' },
];

const INIT_TASKS = [
  { id: 't1', title: 'Implement new auth flow', badge: 'Engineering', badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20', status: 0, assignee: null, comments: 0 },
  { id: 't2', title: 'Design system updates', badge: 'Design', badgeColor: 'text-pink-400 bg-pink-500/10 border-pink-500/20', status: 1, assignee: 'u2', comments: 3 },
  { id: 't3', title: 'Q3 Marketing site refresh', badge: 'Marketing', badgeColor: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', status: 2, assignee: 'u3', comments: 8 },
  { id: 't4', title: 'Fix navigation layout bug', badge: 'Bug', badgeColor: 'text-red-400 bg-red-500/10 border-red-500/20', status: 0, assignee: null, comments: 1 },
];

const LOOP_DURATION = 9000;

export function HeroAnimation() {
  const [tasks, setTasks] = useState(INIT_TASKS);
  const [time, setTime] = useState(0);

  useEffect(() => {
    let start = Date.now();
    let rAF: number;
    
    const tick = () => {
      const now = Date.now();
      const elapsed = (now - start) % LOOP_DURATION;
      setTime(elapsed);
      
      // Sequence logic based on time
      setTasks(prev => {
        const next = [...prev];
        
        // At 1.5s: Assign t1 to u1
        if (elapsed > 1500 && elapsed < 2000) {
          if (!next[0].assignee) next[0] = { ...next[0], assignee: 'u1' };
        }
        
        // At 3.0s: Move t1 to In Progress
        if (elapsed > 3000 && elapsed < 3500) {
          if (next[0].status === 0) next[0] = { ...next[0], status: 1 };
        }
        
        // At 4.5s: t2 gets a comment
        if (elapsed > 4500 && elapsed < 5000) {
          if (next[1].comments === 3) next[1] = { ...next[1], comments: 4 };
        }
        
        // At 6.0s: Move t2 to Done
        if (elapsed > 6000 && elapsed < 6500) {
          if (next[1].status === 1) next[1] = { ...next[1], status: 2 };
        }

        // At 8.5s: Reset for loop
        if (elapsed > 8500) {
          return INIT_TASKS;
        }
        
        return next;
      });
      
      rAF = requestAnimationFrame(tick);
    };
    
    rAF = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rAF);
  }, []);

  const cols = [
    { id: 0, title: 'To Do', icon: <CircleDashed className="w-4 h-4 text-slate-400" /> },
    { id: 1, title: 'In Progress', icon: <Clock className="w-4 h-4 text-blue-400" /> },
    { id: 2, title: 'Done', icon: <CheckCircle2 className="w-4 h-4 text-teal-400" /> },
  ];

  return (
    <div className="hero-anim-wrapper">
       <div className="hero-anim-gradient" />
       
       <motion.div 
         className="hero-anim-board"
         initial={{ opacity: 0, y: 40, scale: 0.95 }}
         animate={{ opacity: 1, y: 0, scale: 1 }}
         transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
       >
          <div className="hero-anim-header">
             <div className="flex gap-2">
               <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
               <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
               <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
             </div>
             
             <div className="ml-4 w-48 h-7 rounded-md bg-white/5 border border-white/5 flex items-center px-3 gap-2">
               <div className="w-3 h-3 rounded-sm bg-purple-500/40" />
               <div className="w-16 h-2 rounded-full bg-white/20" />
             </div>
             
             <div className="ml-auto flex items-center gap-4">
                <div className="w-24 h-7 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <div className="w-12 h-2 rounded-full bg-blue-400/40" />
                </div>
                <div className="hero-anim-avatar-group">
                  {USERS.map(u => (
                    <div key={u.id} className={`hero-anim-avatar ${u.color} ${u.border} border bg-opacity-80 relative`}>
                      {u.initials}
                      {/* Active indicator */}
                      <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 border border-[#141414]" />
                    </div>
                  ))}
                </div>
             </div>
          </div>
          
          <div className="hero-anim-content">
            {cols.map(col => (
              <div key={col.id} className="hero-anim-column">
                 <div className="flex justify-between items-center mb-2 px-1">
                    <div className="flex items-center gap-2">
                      {col.icon}
                      <span className="text-[13px] font-medium text-[var(--text-primary)]">{col.title}</span>
                      <span className="text-xs text-[var(--text-secondary)] bg-white/5 px-2 py-0.5 rounded-full">
                        {tasks.filter(t => t.status === col.id).length}
                      </span>
                    </div>
                    <MoreHorizontal className="w-4 h-4 text-[var(--text-secondary)] opacity-50" />
                 </div>
                 
                 <div className="flex flex-col gap-3 relative h-full">
                   <AnimatePresence mode="popLayout">
                     {tasks.filter(t => t.status === col.id).map(task => (
                       <motion.div
                         key={task.id}
                         layout
                         initial={{ opacity: 0, scale: 0.95 }}
                         animate={{ opacity: 1, scale: 1 }}
                         exit={{ opacity: 0, scale: 0.95 }}
                         transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                         className="hero-anim-card"
                       >
                          {time > 4500 && time < 5500 && task.id === 't2' && (
                            <motion.div 
                              className="absolute -top-2 -right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-lg z-20"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              exit={{ scale: 0 }}
                            >
                              +1
                            </motion.div>
                          )}
                          
                          <div className="flex gap-2 mb-1">
                            <div className={`hero-anim-badge border ${task.badgeColor}`}>
                              {task.badge}
                            </div>
                            {task.id === 't1' && task.status === 1 && (
                              <motion.div 
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: 'auto', opacity: 1 }}
                                className="hero-anim-badge bg-green-500/10 text-green-400 border border-green-500/20 overflow-hidden whitespace-nowrap"
                              >
                                Active
                              </motion.div>
                            )}
                          </div>
                          
                          <div className="text-[14px] leading-snug font-medium text-[var(--text-primary)] tracking-tight">
                            {task.title}
                          </div>
                          
                          <div className="mt-2 flex justify-between items-end h-[24px]">
                             <div className="flex items-center gap-3 opacity-60">
                                <div className="flex items-center gap-1.5 text-[11px] font-medium">
                                  <MessageSquare className="w-3.5 h-3.5"/> 
                                  <motion.span
                                    key={task.comments}
                                    initial={{ y: -10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                  >
                                    {task.comments}
                                  </motion.span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] font-medium"><Link2 className="w-3.5 h-3.5"/></div>
                             </div>
                             
                             <div className="flex items-center gap-1">
                               {task.assignee ? (
                                 <motion.div 
                                   initial={{ scale: 0 }} 
                                   animate={{ scale: 1 }}
                                   className={`hero-anim-avatar ${USERS.find(u => u.id === task.assignee)?.color} bg-opacity-80`}
                                 >
                                   {USERS.find(u => u.id === task.assignee)?.initials}
                                 </motion.div>
                               ) : (
                                 <div className="hero-anim-avatar border border-dashed border-white/20 bg-transparent text-white/30">
                                   +
                                 </div>
                               )}
                             </div>
                          </div>
                          {task.status === 1 && (
                            <motion.div 
                              className="absolute bottom-0 left-0 h-0.5 bg-blue-500"
                              initial={{ width: "0%" }}
                              animate={{ width: task.id === 't1' ? "30%" : "80%" }}
                              transition={{ duration: 4, ease: "linear" }}
                            />
                          )}
                       </motion.div>
                     ))}
                   </AnimatePresence>
                 </div>
              </div>
            ))}
          </div>
       </motion.div>
    </div>
  )
}
