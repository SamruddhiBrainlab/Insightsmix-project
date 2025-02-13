import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import {
  Box,
  Button,
  Tabs,
  Tab,
  CircularProgress,
  Typography,
  Paper,
  Alert,
} from "@mui/material";

const GenAISummary = ({ selectedProject }) => {
  const [activeTab, setActiveTab] = useState("mmm");
  const [mmmContent, setMmmContent] = useState("");
  const [msoContent, setMsoContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const user = localStorage.getItem("user")
    ? JSON.parse(localStorage.getItem("user"))
    : null;

  const fetchMarkdownContent = (filename) => {
    return fetch(
      `/api/genai-summary-files?project_id=${selectedProject}&email=${user.email}&filename=${filename}`
    ).then((response) => {
      if (!response.ok) {
        throw new Error(
          `Failed to fetch the summary for project ${selectedProject}`
        );
      }
      return response.text();
    });
  };

  useEffect(() => {
    if (selectedProject) {
      setIsLoading(true);
      setError(null);
  
      fetchMarkdownContent("MMM_summary.md")
        .then((mmmData) => {
          setMmmContent(mmmData);
          // After MMM completes, fetch MSO
          return fetchMarkdownContent("MSO_summary.md");
        })
        .then((msoData) => {
          setMsoContent(msoData);
          setIsLoading(false);
        })
        .catch((error) => {
          console.error("Error fetching summaries:", error);
          setError(error.message);
          setIsLoading(false);
        });
    }
  }, [selectedProject]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box 
      sx={{ 
        width: "100%", 
        display: "flex", 
        flexDirection: "column",
        alignItems: "stretch",      // This ensures full width alignment
        justifyContent: "flex-start", 
        padding: 2,
        margin: '0 auto',          // Centers the box itself if needed
        '& .MuiTabs-root': {       // Override Tabs alignment specifically
          '& .MuiTabs-flexContainer': {
            justifyContent: 'flex-start'  // Aligns tabs to the left
          }
        }
      }}
    >
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        indicatorColor="primary"
        textColor="primary"
        aria-label="summary tabs"
        // Remove 'centered' prop if you don't want centered tabs
      >
        <Tab label="MMM Summary" value="mmm" />
        <Tab label="MSO Summary" value="mso" />
      </Tabs>

      {/* Content box */}
      <Paper
        elevation={3}
        sx={{
          marginTop: 2,
          padding: 3,
          backgroundColor: "white",
        }}
      >
        {isLoading ? (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: 100,
            }}
          >
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <Box sx={{ maxWidth: "100%" }}>
            <ReactMarkdown>
              {activeTab === "mmm" ? mmmContent : msoContent}
            </ReactMarkdown>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default GenAISummary;
