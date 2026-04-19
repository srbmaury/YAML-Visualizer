/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useState, useEffect } from "react";

const THEME_KEY = "yaml-visualizer-theme";

export const ThemeContext = createContext();

export function ThemeProvider({ children }) {
    const [darkMode, setDarkMode] = useState(() => {
        try {
            const saved = localStorage.getItem(THEME_KEY);
            if (saved !== null) return saved === "dark";
            return window.matchMedia("(prefers-color-scheme: dark)").matches;
        } catch {
            return false;
        }
    });

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
        localStorage.setItem(THEME_KEY, darkMode ? "dark" : "light");
    }, [darkMode]);

    const toggleDarkMode = () => setDarkMode((prev) => !prev);

    return (
        <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
            {children}
        </ThemeContext.Provider>
    );
}
