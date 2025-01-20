import React from "react";
import { Routes, Route } from "react-router-dom";
import DashboardForm from "./DashboardForm/DashboardForm";
import ProjectSelection from "./ProjectSelection";
import EDAReport from "./EDAReport";
import ModelSummary from "./ModelSummary";
import MSOOptimization from "./MSOOptimization";
import GenAISummary from "./GenAISummary";

const MainLayout = ({ selectedTab, selectedProject, onProjectSelect }) => {
  const showProjectSelection = selectedTab !== "Insights";
  const compactView = !!selectedProject;

  return (
    <main style={{ flex: 1, padding: "24px", marginTop: "60px", marginLeft: "240px", backgroundColor: "#fcf8ef" }}>
      {/* Always render ProjectSelection (except for Insights) */}
      {showProjectSelection && (
        <ProjectSelection 
          selectedTab={selectedTab} 
          selectedProject={selectedProject}
          onProjectSelect={onProjectSelect}
          compactView={compactView}
        />
      )}
      
      <Routes>
        <Route path="/" element={<DashboardForm selectedProject={selectedProject} />} />

        {selectedProject && (
          <>
            <Route path="/eda-report" element={<EDAReport selectedProject={selectedProject} />} />
            <Route path="/mmm-model-summary" element={<ModelSummary selectedProject={selectedProject} />} />
            <Route path="/mso-optimization-results" element={<MSOOptimization selectedProject={selectedProject} />} />
            <Route path="/gen-ai-explanation" element={<GenAISummary selectedProject={selectedProject} />} />
          </>
        )}
      </Routes>
    </main>
  );
};

export default MainLayout;
