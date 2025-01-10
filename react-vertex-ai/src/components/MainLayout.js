import React from "react";
import { Routes, Route } from "react-router-dom";
import DashboardForm from "./DashboardForm";

const MainLayout = () => {
  return (
    <main style={{ flex: 1, padding: "24px", marginTop: "60px", marginLeft: "240px" }}>
      <Routes>
        <Route path="/" element={<DashboardForm />} />
        {/* Add other routes here */}
      </Routes>
    </main>
  );
};

export default MainLayout;
