import { useState, useCallback, useRef } from 'react';
import { loadConfig, loadPolicy } from '../core/config.js';
import { loadState, updateState } from '../core/session.js';
import { initLogger } from '../utils/logger.js';
export function useSession(workDir) {
    const [messages, setMessages] = useState([]);
    const [config] = useState(() => {
        const cfg = loadConfig(workDir);
        // Initialize the structured logger with the configured log level
        const level = (cfg.log_level || 'info').toUpperCase();
        const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
        initLogger(workDir, validLevels.includes(level) ? level : 'INFO');
        return cfg;
    });
    const [policy] = useState(() => loadPolicy(workDir));
    const [state, setStateLocal] = useState(() => loadState(workDir));
    const [permissionMode] = useState('ask');
    const [activeAgent, setActiveAgentRaw] = useState(null);
    const [activeTeam, setActiveTeamRaw] = useState(null);
    const msgCounter = useRef(0);
    const addMessage = useCallback((msg) => {
        msgCounter.current += 1;
        const full = {
            ...msg,
            id: `msg-${msgCounter.current}`,
            timestamp: new Date(),
        };
        setMessages((prev) => [...prev, full]);
        return full;
    }, []);
    const updateSessionState = useCallback((updates) => {
        const newState = updateState(workDir, updates);
        setStateLocal(newState);
    }, [workDir]);
    // Mutual exclusion: activating an agent clears the team, and vice versa
    const setActiveAgent = useCallback((name) => {
        setActiveAgentRaw(name);
        if (name)
            setActiveTeamRaw(null);
    }, []);
    const setActiveTeam = useCallback((team) => {
        setActiveTeamRaw(team);
        if (team)
            setActiveAgentRaw(null);
    }, []);
    const sessionContext = {
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
//# sourceMappingURL=useSession.js.map