import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import MainLayout from "./components/MainLayout";
import HomePage from "./components/HomePage";
import LoginPage from "./components/LoginPage";

function App() {
  return (
    <Router>
      <Routes>
        {/* Home Page route (no Sidebar or Header) */}
        <Route path="/" element={<HomePage />} />

        {/* Login Page route (no Sidebar or Header) */}
        <Route path="/login" element={<LoginPage />} />

        {/* Dashboard and other protected routes */}
        <Route
          path="/dashboard/*"
          element={
            <div className="flex h-screen bg-gray-50">
              {/* Sidebar */}
              <Sidebar />

              {/* Main Content */}
              <div className="flex-1 flex flex-col">
                <Header />
                <MainLayout />
              </div>
            </div>
          }
        />

        {/* Catch-all route for undefined paths */}
        <Route path="*" element={<div className="p-6 text-center">404 - Page Not Found</div>} />
      </Routes>
    </Router>
  );
}

export default App;
