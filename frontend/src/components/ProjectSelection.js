import React, { useEffect, useState } from "react";
import { Box, Grid } from "@mui/material";

const ProjectSelection = ({ selectedTab, onProjectSelect, selectedProject, compactView }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const user = localStorage.getItem("user");
  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  const userEmail = user ? JSON.parse(user).email : null;

  useEffect(() => {
    if (selectedTab === "Insights") return;

    const fetchProjects = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`${backendUrl}/api/get-user-projects?email=${userEmail}`);
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch projects");
        }
        
        setProjects(data.projects || []);
      } catch (err) {
        if (err.message !== "No projects found for this user") {
          setError(err.message);
        } else {
          setProjects([]);
        }
      } finally {
        setLoading(false);
      }
    };

    if (userEmail) {
      fetchProjects();
    }
  }, [selectedTab, userEmail]);

  if (selectedTab === "Insights") return null;

  return (
    <Box sx={{ mt: 5, ml: "40%",
      position: compactView ? "absolute" : "relative",
      top: compactView ? "16px" : "initial",
      right: compactView ? "16px" : "initial",
      width: compactView ? "150px" : "300px",
      }}> 
      <Grid container spacing={3}>
        <Grid item xs={12}>
          {!compactView && (
          <Box>
            <label
              htmlFor="project-select"
              style={{ fontSize: '16px', fontWeight: '600', color: '#333' }}
            >
              Select Project:
            </label>
          </Box>)}

          <Box sx={{ position: 'relative' }}>
            <select
              id="project-select"
              value={selectedProject || ""}
              onChange={(e) => onProjectSelect(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '5px',
                fontSize: '14px',
                color: '#555',
                marginTop: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
              disabled={loading}
            >
              <option value="">Select a project...</option>
              {projects.map((project) => (
                <option key={project.project_id} value={project.project_id}>
                  {project.name}
                </option>
              ))}
            </select>

            {loading && (
              <Box sx={{ mt: 2, color: '#666' }}>Loading projects...</Box>
            )}

            {!loading && error && (
              <Box sx={{ mt: 2, color: '#E74C3C' }}>
                {error}
              </Box>
            )}

            {!loading && !error && projects.length === 0 && (
              <Box sx={{ mt: 2, color: '#666' }}>
                You haven't created any projects yet. Start by creating one!
              </Box>
            )}
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ProjectSelection;
