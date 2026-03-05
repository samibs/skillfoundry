import { useState, useCallback, useRef } from 'react';
import type {
  Message,
  SfConfig,
  SfPolicy,
  SfState,
  SessionContext,
  PermissionMode,
  TeamDefinitionRef,
} from '../types.js';
import { loadConfig, loadPolicy } from '../core/config.js';
import { loadState, updateState } from '../core/session.js';
import { initLogger } from '../utils/logger.js';
import type { LogLevel } from '../utils/logger.js';

export function useSession(workDir: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [config] = useState<SfConfig>(() => {
    const cfg = loadConfig(workDir);
    // Initialize the structured logger with the configured log level
    const level = (cfg.log_level || 'info').toUpperCase() as LogLevel;
    const validLevels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    initLogger(workDir, validLevels.includes(level) ? level : 'INFO');
    return cfg;
  });
  const [policy] = useState<SfPolicy>(() => loadPolicy(workDir));
  const [state, setStateLocal] = useState<SfState>(() => loadState(workDir));
  const [permissionMode] = useState<PermissionMode>('ask');
  const [activeAgent, setActiveAgentRaw] = useState<string | null>(null);
  const [activeTeam, setActiveTeamRaw] = useState<TeamDefinitionRef | null>(null);
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

  // Mutual exclusion: activating an agent clears the team, and vice versa
  const setActiveAgent = useCallback((name: string | null) => {
    setActiveAgentRaw(name);
    if (name) setActiveTeamRaw(null);
  }, []);

  const setActiveTeam = useCallback((team: TeamDefinitionRef | null) => {
    setActiveTeamRaw(team);
    if (team) setActiveAgentRaw(null);
  }, []);

  const sessionContext: SessionContext = {
    config,
    policy,
    state,
    messages,
    permissionMode,
    workDir,
    activeAgent,
    activeTeam,
    addMessage,
    setState: updateSessionState,
    setActiveAgent,
    setActiveTeam,
  };

  return {
    messages,
    config,
    policy,
    state,
    permissionMode,
    activeAgent,
    activeTeam,
    addMessage,
    updateSessionState,
    setActiveAgent,
    setActiveTeam,
    sessionContext,
  };
}
