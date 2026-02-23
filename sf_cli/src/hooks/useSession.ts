import { useState, useCallback, useRef } from 'react';
import type {
  Message,
  SfConfig,
  SfPolicy,
  SfState,
  SessionContext,
  PermissionMode,
} from '../types.js';
import { loadConfig, loadPolicy } from '../core/config.js';
import { loadState, updateState } from '../core/session.js';

export function useSession(workDir: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [config] = useState<SfConfig>(() => loadConfig(workDir));
  const [policy] = useState<SfPolicy>(() => loadPolicy(workDir));
  const [state, setStateLocal] = useState<SfState>(() => loadState(workDir));
  const [permissionMode] = useState<PermissionMode>('ask');
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const msgCounter = useRef(0);

  const addMessage = useCallback(
    (msg: Omit<Message, 'id' | 'timestamp'>): Message => {
      msgCounter.current += 1;
      const full: Message = {
        ...msg,
        id: `msg-${msgCounter.current}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, full]);
      return full;
    },
    [],
  );

  const updateSessionState = useCallback(
    (updates: Partial<SfState>) => {
      const newState = updateState(workDir, updates);
      setStateLocal(newState);
    },
    [workDir],
  );

  const sessionContext: SessionContext = {
    config,
    policy,
    state,
    messages,
    permissionMode,
    workDir,
    activeAgent,
    addMessage,
    setState: updateSessionState,
    setActiveAgent,
  };

  return {
    messages,
    config,
    policy,
    state,
    permissionMode,
    activeAgent,
    addMessage,
    updateSessionState,
    setActiveAgent,
    sessionContext,
  };
}
