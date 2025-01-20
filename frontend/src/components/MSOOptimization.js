import React, { useEffect, useState } from "react";
import { Paper, Box, CircularProgress, Typography, Button } from '@mui/material';
import { Error as ErrorIcon } from '@mui/icons-material';

const MSOOptimization = ({ selectedProject }) => {
  const user = localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user")) : null;
  const [htmlContent, setHtmlContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [prevSelectedProject, setPrevSelectedProject] = useState(null);

  // Function to load scripts sequentially
  const loadScript = (src) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  // Function to execute scripts inside the fetched HTML
  const executeScripts = async (container) => {
    try {
      // First, load all required libraries
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/vega/5.22.1/vega.min.js");
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/vega-lite/5.6.0/vega-lite.min.js");
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/vega-embed/6.21.0/vega-embed.min.js");

      // Now execute the scripts from the container
      const scripts = container.getElementsByTagName("script");
      for (let script of scripts) {
        if (script.src) {
          await loadScript(script.src);
        } else {
          // For inline scripts, wait for a small delay to ensure libraries are ready
          await new Promise(resolve => setTimeout(resolve, 100));
          const newScript = document.createElement("script");
          newScript.textContent = script.textContent;
          try {
            await eval(newScript.textContent);
          } catch (error) {
            console.error("Error executing inline script:", error);
          }
        }
      }

      // Initialize any Vega visualizations
      const vegaContainers = document.querySelectorAll('[data-vega-spec]');
      for (const container of vegaContainers) {
        try {
          const spec = JSON.parse(container.dataset.vegaSpec);
          await window.vegaEmbed(container, spec, {
            actions: true,
            theme: 'light'
          });
        } catch (error) {
          console.error("Error embedding Vega visualization:", error);
        }
      }
    } catch (error) {
      console.error("Error loading scripts:", error);
      setError("Failed to load visualization libraries");
    }
  };

  useEffect(() => {
    if (!selectedProject || selectedProject === prevSelectedProject) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setPrevSelectedProject(selectedProject);

    const url = new URL("/api/get-report", window.location.origin);
    url.searchParams.append("project_id", selectedProject);
    url.searchParams.append("filename", "optimization_output.html");
    if (user) {
      url.searchParams.append("email", user.email);
    }

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch the MSO Optimization report for project ${selectedProject}`);
        }
        return response.text();
      })
      .then((data) => {
        setHtmlContent(data);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching MSO Optimization report:", error);
        setError(error.message);
        setIsLoading(false);
      });
  }, [selectedProject, prevSelectedProject, user]);

  useEffect(() => {
    if (htmlContent) {
      const container = document.createElement("div");
      container.innerHTML = htmlContent;
      executeScripts(container).catch(error => {
        console.error("Error executing scripts:", error);
        setError("Failed to initialize visualizations");
      });
    }
  }, [htmlContent]);

  if (isLoading) {
    return (
      <Paper 
        elevation={1}
        sx={{
          mt: 4,
          height: '500px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Box sx={{ textAlign: 'center', p: 4 }}>
          <CircularProgress size={32} />
          <Typography sx={{ mt: 2, color: 'text.secondary' }}>
            Loading MSO Optimization report...
          </Typography>
        </Box>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper elevation={1} sx={{ p: 4, mt: 4 }}>
        <Box sx={{ textAlign: 'center' }}>
          <ErrorIcon 
            sx={{ 
              width: 48, 
              height: 48, 
              color: 'error.main',
              mb: 2 
            }} 
          />
          <Typography 
            variant="h6" 
            sx={{ 
              color: 'error.main',
              fontWeight: 600,
              mb: 1 
            }}
          >
            Error loading report
          </Typography>
          <Typography 
            variant="body2" 
            sx={{ 
              color: 'error.main',
              mb: 2 
            }}
          >
            {error}
          </Typography>
          <Button 
            variant="contained" 
            color="error"
            onClick={() => window.location.reload()}
            sx={{ 
              '&:hover': {
                bgcolor: 'error.dark'
              }
            }}
          >
            Try Again
          </Button>
        </Box>
      </Paper>
    );
  }

  if (!htmlContent) {
    return (
      <Paper elevation={1} sx={{ p: 4, mt: 4 }}>
        <Typography 
          sx={{ 
            textAlign: 'center',
            color: 'text.secondary'
          }}
        >
          No report available for the selected project.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper 
      elevation={1}  // Controls shadow depth (1-24)
      sx={{
        mt: 4,       // margin top: 4 * theme spacing
        borderRadius: 1,
        overflow: 'hidden'
      }}
    >
      <Box
        dangerouslySetInnerHTML={{ __html: htmlContent }}
        sx={{
          p: 3,      // padding: 3 * theme spacing
          maxWidth: '100%',
          overflowX: 'auto',
          overflowY: 'auto',
          maxHeight: 'calc(100vh - 60px)',
          // If you need to style the content itself:
          '& > *': {  // Targets direct children of the HTML content
            maxWidth: '100%'
          }
        }}
      />
    </Paper>
      );
};

export default MSOOptimization;