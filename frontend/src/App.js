import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import MainLayout from "./components/MainLayout";
import HomePage from "./components/HomePage";
import LoginPage from "./components/LoginPage";
import PrivateRoute from "./components/ProtectedRoute";

function App() {
  const [selectedTab, setSelectedTab] = useState("Insights");
  const [selectedProject, setSelectedProject] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for user data in localStorage when the app loads
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('user');
        setUser(null);
      }
    } else {
      setUser(null);
    }
    setIsLoading(false);
  }, []); // Initial check

  // Add another useEffect to watch localStorage changes
  useEffect(() => {
    const handleStorageChange = () => {
      const storedUser = localStorage.getItem('user');
      if (!storedUser) {
        setUser(null);
      } else {
        try {
          setUser(JSON.parse(storedUser));
        } catch (error) {
          setUser(null);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleProjectSelect = (project) => {
    setSelectedProject(project);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <Router>
      <Routes>
        <Route 
          path="/" 
          element={
            user ? <Navigate to="/dashboard" replace /> : <HomePage />
          } 
        />
        <Route 
          path="/login" 
          element={
            user ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LoginPage setUser={(userData) => {
                setUser(userData);
                localStorage.setItem('user', JSON.stringify(userData));
              }} />
            )
          } 
        />
        
        {/* Use PrivateRoute to protect the dashboard route */}
        <Route
          path="/dashboard/*"
          element={
            <PrivateRoute element={
              <div className="flex h-screen bg-gray-50">
                <Sidebar 
                  onTabClick={setSelectedTab} 
                  selectedProject={selectedProject}
                />
                <div className="flex-1 flex flex-col">
                  <Header 
                    selectedProject={selectedProject} 
                    setUser={setUser}  // Pass setUser to Header
                  />
                  <MainLayout 
                    selectedTab={selectedTab}
                    selectedProject={selectedProject}
                    onProjectSelect={handleProjectSelect}
                  />
                </div>
              </div>
            } />
          }
        />
        
        <Route path="*" element={<div className="p-6 text-center">404 - Page Not Found</div>} />
      </Routes>
    </Router>
  );
}

export default App;