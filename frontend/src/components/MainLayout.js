import React, { useState } from "react";
import { Routes, Route } from "react-router-dom";
import ProjectSelection from "./ProjectSelection";
import ModelSummary from "./ModelSummary";
import MSOOptimization from "./MSOOptimization";
import GenAISummary from "./GenAISummary";
import UserGuide from "./UserGuide";
import InsightsFlow from "./DashboardForm/InsightsFlow";
import ModelTrainingForm from "./DashboardForm/ModelTrainingForm";

const MainLayout = ({ selectedTab, selectedProject, onProjectSelect }) => {
  const showProjectSelection = (selectedTab !== "User Guide" && selectedTab !== "MMM Model Training");
  const compactView = !!selectedProject;
  const [initialData, setInitialData] = useState(null);

  return (
    <main style={{ flex: 1, padding: "24px", marginLeft: "60px", marginTop: "60px", backgroundColor: "#fcf8ef" }}>
      {showProjectSelection && (
        <ProjectSelection 
          selectedTab={selectedTab} 
          selectedProject={selectedProject}
          onProjectSelect={onProjectSelect}
          compactView={compactView}
        />
      )}

      <Routes>
        <Route path="/insights" element={<InsightsFlow setInitialData={setInitialData} initialData={initialData}/>} />
        <Route path="/mmm-model-training" element={<ModelTrainingForm initialData={initialData} />} />
        {selectedProject && (
          <>
            <Route path="/mmm-model-summary" element={<ModelSummary selectedProject={selectedProject} />} />
            <Route path="/mso-optimization-results" element={<MSOOptimization selectedProject={selectedProject} />} />
            <Route path="/gen-ai-explanation" element={<GenAISummary selectedProject={selectedProject} />} />
          </>
        )}
        <Route path="/user-guide" element={<UserGuide/>} />
      </Routes>
    </main>
  );
};

export default MainLayout;