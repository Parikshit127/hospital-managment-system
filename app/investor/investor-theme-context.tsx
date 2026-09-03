'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface InvestorThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    toggleTheme: () => void;
}

const InvestorThemeContext = createContext<InvestorThemeContextType | undefined>(undefined);

export function InvestorThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>('light');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('investor_portal_theme') as Theme | null;
        if (saved === 'dark' || saved === 'light') {
            setThemeState(saved);
        } else {
            setThemeState('light'); // Default to Executive White & Orange Theme
        }
        setMounted(true);
    }, []);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem('investor_portal_theme', newTheme);
    };

    const toggleTheme = () => {
        const nextTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(nextTheme);
    };

    return (
        <InvestorThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
            <div className={theme === 'dark' ? 'dark bg-[#0b0f19] text-slate-100 min-h-screen' : 'bg-[#f8fafc] text-slate-900 min-h-screen'}>
                {children}
            </div>
        </InvestorThemeContext.Provider>
    );
}

export function useInvestorTheme() {
    const context = useContext(InvestorThemeContext);
    if (!context) {
        throw new Error('useInvestorTheme must be used within an InvestorThemeProvider');
    }
    return context;
}
