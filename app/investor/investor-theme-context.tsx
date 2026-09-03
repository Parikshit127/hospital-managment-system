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
            setThemeState('light'); // Default to White & Orange Theme
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
            <div className={theme === 'dark' ? 'dark-investor-theme' : 'light-investor-theme'}>
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
