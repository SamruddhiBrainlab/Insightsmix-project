import React, { useEffect, useState } from "react";
import { Paper, Box, CircularProgress, Typography, Button } from '@mui/material';
import { Error as ErrorIcon, Download as DownloadIcon } from '@mui/icons-material';

const EDAReport = ({ selectedProject }) => {
  const user = localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user")) : null;
  const [htmlContent, setHtmlContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [prevSelectedProject, setPrevSelectedProject] = useState(null);
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  
  const handleDownload = () => {
    try {
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `eda_report_${selectedProject}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading report:", error);
      setError("Failed to download report");
    }
  };

  const loadScript = (src) => {
    return new Promise((resolve, reject) => {
      // Check if script already exists
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  // Load required external scripts first
  useEffect(() => {
    const loadRequiredScripts = async () => {
      try {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js");
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/vega/5.22.1/vega.min.js");
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/vega-lite/5.6.0/vega-lite.min.js");
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/vega-embed/6.21.0/vega-embed.min.js");
        setScriptsLoaded(true);
      } catch (error) {
        console.error("Error loading required scripts:", error);
        setError("Failed to load required libraries");
      }
    };

    loadRequiredScripts();
  }, []);

  const executeScripts = async (container) => {
    try {
      const scripts = container.getElementsByTagName("script");
      for (let script of scripts) {
        if (script.src) {
          await loadScript(script.src);
        } else {
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
      console.error("Error executing scripts:", error);
      setError("Failed to initialize visualizations");
    }
  };

  // Fetch report data
  useEffect(() => {
    if (!selectedProject || selectedProject === prevSelectedProject || !scriptsLoaded) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setPrevSelectedProject(selectedProject);

    const url = new URL("/api/get-eda-report", window.location.origin);
    url.searchParams.append("project_id", selectedProject);
    url.searchParams.append("filename", "eda_report.html");
    if (user) {
      url.searchParams.append("email", user.email);
    }

    const fetchReport = async () => {
      try {
        const response = await fetch(url, {
          headers: {
            'Accept-Encoding': 'gzip'
          }
        });

        if (!response.ok) {
          localStorage.removeItem('insightsFlow_showEDA');
          localStorage.removeItem('insightsFlow_initialData');
          throw new Error(`Failed to fetch the EDA report for project ${selectedProject}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          try {
            // Make sure pako is available before using it
            if (window.pako) {
              const decompressed = window.pako.ungzip(value);
              const chunkText = decoder.decode(decompressed);
              accumulatedContent += chunkText;
              setHtmlContent(accumulatedContent);
            } else {
              throw new Error("Decompression library not loaded");
            }
          } catch (error) {
            // If decompression fails, try treating it as uncompressed data
            console.warn("Decompression failed, treating as uncompressed:", error);
            const chunkText = decoder.decode(value);
            accumulatedContent += chunkText;
            setHtmlContent(accumulatedContent);
          }
        }

        setIsLoading(false);
      } catch (error) {
        localStorage.removeItem('insightsFlow_showEDA');
        localStorage.removeItem('insightsFlow_initialData');
        console.error("Error fetching EDA report:", error);
        setError(error.message);
        setIsLoading(false);
      }
    };

    fetchReport();
  }, [selectedProject, prevSelectedProject, user, scriptsLoaded]);

  // Execute scripts when content updates
  useEffect(() => {
    if (htmlContent && scriptsLoaded) {
      const container = document.createElement("div");
      container.innerHTML = htmlContent;
      executeScripts(container).catch(error => {
        console.error("Error executing scripts:", error);
        setError("Failed to initialize visualizations");
      });
    }
  }, [htmlContent, scriptsLoaded]);

  // Rest of the component remains the same...
  if (isLoading && !htmlContent) {
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
            Loading EDA report...
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
      elevation={1}
      sx={{
        mt: 4,
        borderRadius: 1,
        overflow: 'hidden'
      }}
    >
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          onClick={handleDownload}
          sx={{
            bgcolor: 'primary.main',
            '&:hover': {
              bgcolor: 'primary.dark'
            }
          }}
        >
          Download Report
        </Button>
      </Box>
      <Box
        dangerouslySetInnerHTML={{ __html: htmlContent }}
        sx={{
          p: 3,
          maxWidth: '100%',
          overflowX: 'auto',
          overflowY: 'auto',
          position: 'relative',
          maxHeight: 'calc(100vh - 60px)',
          '& > *': {
            maxWidth: '100%'
          },
          '& .navbar-fixed-top': {
            position: 'static !important'
          },
          '& body': {
            marginTop: '0 !important'
          }
        }}
      />
    </Paper>
  );
};

export default EDAReport;