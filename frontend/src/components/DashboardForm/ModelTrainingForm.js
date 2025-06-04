import React, { useState, useEffect } from "react";
import { Box, Paper, Grid, Select, MenuItem, Checkbox, ListItemText, Button, Alert, Typography, CircularProgress } from "@mui/material";

const ModelTrainingForm = ({ initialData }) => {
  const user = localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user")) : null;
  const savedIsLoading = localStorage.getItem('isLoading') === 'true';
  const [isLoading, setIsLoading] = useState(savedIsLoading);
  const [isFormLoading, setIsFormLoading] = useState(false);
  const [error, setError] = useState("");
  const savedJobId = localStorage.getItem('jobId');
  const [jobId, setJobId] = useState(savedJobId || null);
  const [isJobCompleted, setIsJobCompleted] = useState(false);
  const [columns, setColumns] = useState([]);
  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  
  // Define which fields should be multi-select
  const multiSelectFields = ['control_variable', 'media', 'mediaSpend'];
  
  const [formData, setFormData] = useState({
    control_variable: [],
    population: "",
    mediaSpend: [], // Switched position with media
    date: "",
    geo: "",
    kpi: "",
    revenuePerKpi: "",
    media: [], // Switched position with mediaSpend
  });

  // Validation function for media channels matching
  const validateMediaChannels = () => {
    const { media, mediaSpend } = formData;
    
    if (media.length === 0 && mediaSpend.length === 0) {
      return { isValid: true, message: "" };
    }
    
    if (media.length !== mediaSpend.length) {
      return {
        isValid: false,
        message: `Media channels count (${media.length}) must match Media Spend channels count (${mediaSpend.length})`
      };
    }
    
    // Extract channel base names for comparison
    const getChannelBaseName = (channelName) => {
      // Remove common suffixes like _clicks, _spend, _impressions, etc.
      return channelName.replace(/_(clicks|spend|spends|impressions|impression|views|ctr|cpc|cpm|cost)$/i, '');
    };
    
    const mediaBaseNames = media.map(getChannelBaseName).sort();
    const mediaSpendBaseNames = mediaSpend.map(getChannelBaseName).sort();
    
    console.log(mediaBaseNames)
    console.log(mediaSpendBaseNames)
    const mismatchedChannels = [];
    for (let i = 0; i < mediaBaseNames.length; i++) {
      if (mediaBaseNames[i] !== mediaSpendBaseNames[i]) {
        mismatchedChannels.push({
          media: mediaBaseNames[i],
          spend: mediaSpendBaseNames[i]
        });
      }
    }
    
    if (mismatchedChannels.length > 0) {
      return {
        isValid: false,
        message: `Media and Media Spend channels must correspond to the same marketing channels. Mismatched channels detected.`
      };
    }
    
    return { isValid: true, message: "" };
  };

  const isTimeColumn = (columnName) => {
    const timeKeywords = ['date', 'time'];
    return timeKeywords.some(keyword => 
      columnName.toLowerCase().includes(keyword.toLowerCase())
    );
  };

  const isGeoColumn = (columnName) => {
    return columnName.toLowerCase().includes('geo');
  };

  const getAvailableOptions = (field) => {
    // Special case: For mediaSpend, we want to include options selected in media
    if (field === 'mediaSpend') {
      const selectedInOtherFields = Object.entries(formData)
        .filter(([key]) => key !== field) // Exclude both current field and media
        .flatMap(([key, value]) => {
          // Handle both single values and arrays
          if (Array.isArray(value)) {
            return value;
          } else if (value) {
            return [value];
          }
          return [];
        });

      let availableColumns = columns
        .filter(col => !selectedInOtherFields.includes(col))
        .filter(col => {
          // Only include columns that contain "spend" (case-insensitive)
          const colStr = String(col).toLowerCase();
          return colStr.includes('spend') || colStr.includes('spends') || 
             colStr.includes('Spend') || colStr.includes('Spends');
        });
      
      // For mediaSpend, don't filter out time or geo columns since media options should be available
      return availableColumns;
    } else {
      // Original logic for other fields
      const selectedInOtherFields = Object.entries(formData)
        .filter(([key]) => key !== field)
        .flatMap(([key, value]) => {
          // Handle both single values and arrays
          if (Array.isArray(value)) {
            return value;
          } else if (value) {
            return [value];
          }
          return [];
        });
      
      let availableColumns = columns.filter(col => !selectedInOtherFields.includes(col));

      if (field === 'date') {
        return availableColumns.filter(col => isTimeColumn(col));
      }
      if (field === 'geo') {
        return availableColumns.filter(col => isGeoColumn(col));
      }
      
      return availableColumns.filter(col => 
        !isTimeColumn(col) && !isGeoColumn(col)
      );
    }
  };

  useEffect(() => {
    const fetchColumns = async () => {
      if (!user?.email || !initialData?.project_id) {
        return;
      }
  
      setIsFormLoading(true);
      setError(null);
  
      try {
        const url = new URL("/api/get-input-options", backendUrl);
        url.searchParams.append("project_id", initialData.project_id);
        url.searchParams.append("user_email", user.email);
  
        const response = await fetch(url);
  
        if (!response.ok) {
          throw new Error(`Failed to fetch columns for project ${initialData.project_id}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
          console.log(data.options)
          // Filter out any options that are empty, null, or undefined
          const filteredOptions = (data.options || []).filter(option => 
            option !== null && option !== undefined && option !== "" && option !== "Unnamed: 0"
          );
          setColumns(filteredOptions);
        } else {
          throw new Error("Failed to load columns");
        }
      } catch (error) {
        console.error("Error loading columns:", error);
        setError(error.message);
      } finally {
        setIsFormLoading(false);
      }
    };
  
    fetchColumns();
  }, [user?.email, initialData?.project_id, backendUrl]);

  const resetForm = () => {
    setFormData({
      control_variable: [],
      population: "",
      mediaSpend: [], // Switched position
      date: "",
      geo: "",
      kpi: "",
      revenuePerKpi: "",
      media: [], // Switched position
    });
    setJobId(null);
    setIsJobCompleted(false);
    localStorage.removeItem('jobId');
    localStorage.removeItem('isLoading');
  };

  useEffect(() => {
    let intervalId;

    const checkJobStatus = async () => {
      if (!jobId) return;

      try {
        const cropJobId = jobId.split("/").pop();
        const response = await fetch(`${backendUrl}/api/training/status/${cropJobId}`);
        const data = await response.json();

        if (data.state === 'JOB_STATE_SUCCEEDED') {
          setIsJobCompleted(true);
          setIsLoading(false);
          clearInterval(intervalId);
          setTimeout(() => {
            resetForm();
          }, 2000);
        } else if (data.state === 'JOB_STATE_FAILED') {
          setError('Job failed: ' + (data.error || 'Unknown error'));
          setIsLoading(false);
          clearInterval(intervalId);
          setTimeout(() => {
            resetForm();
          }, 2000);
        }
      } catch (err) {
        console.error('Error checking job status:', err);
      }
    };

    if (jobId && !isJobCompleted) {
      intervalId = setInterval(checkJobStatus, 10000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [jobId, isJobCompleted]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate media channels before submission
    const validation = validateMediaChannels();
    if (!validation.isValid) {
      setError(validation.message);
      return;
    }
    
    setIsLoading(true);
    setError("");

    const fullFormData = {
      ...formData,
      projectName: initialData.project_name,
      projectId: initialData.project_id,
      userEmail: user.email
    };

    try {
      const response = await fetch(`${backendUrl}/api/submit-form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullFormData),
      });
      const data = await response.json();
      
      if (response.ok) {
        setJobId(data.result.job_id);
        localStorage.setItem('jobId', data.result.job_id);
        localStorage.setItem('isLoading', 'true');
      } else {
        throw new Error(data.message || "Submission failed");
      }
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isLoading) {
      localStorage.setItem('isLoading', 'true');
    } else {
      localStorage.removeItem('isLoading');
      localStorage.removeItem('jobId')
    }
  }, [isLoading]);

  // Real-time validation effect
  useEffect(() => {
    const validation = validateMediaChannels();
    if (!validation.isValid && (formData.media.length > 0 || formData.mediaSpend.length > 0)) {
      // Only show validation error if user has made selections
      if (error !== validation.message) {
        setError(validation.message);
      }
    } else if (validation.isValid && error && error.includes('Media')) {
      // Clear media-related errors when validation passes
      setError("");
    }
  }, [formData.media, formData.mediaSpend]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', width: '100%', gap: 3 }}>
        <CircularProgress size={60} />
        <Typography>Your Model Is Training...</Typography>
      </Box>
    );
  }
  
  if (isFormLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', width: '100%', gap: 3 }}>
        <CircularProgress size={60} />
        <Typography>Loading</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '800px', margin: '0 auto' }}>
      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Switched the order: mediaSpend comes before media */}
            {["date", "geo", "control_variable", "population", "kpi", "revenuePerKpi", "mediaSpend", "media"].map((field) => {
              const isMultiSelect = multiSelectFields.includes(field);
              
              return (
                <Grid item xs={12} sm={6} key={field}>
                  <Box sx={{ mb: 2 }}>
                    <label>
                      {field === 'mediaSpend' ? 'Media Spend' : field.charAt(0).toUpperCase() + field.slice(1)}
                      {field !== "population" && <span style={{ color: 'red' }}>*</span>}
                    </label>
                    <Select
                      name={field}
                      multiple={isMultiSelect}
                      value={formData[field] || (isMultiSelect ? [] : "")}
                      onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
                      fullWidth
                      size="small"
                      renderValue={isMultiSelect ? (selected) => selected.join(", ") : undefined}
                    >
                      {getAvailableOptions(field).map((option) => (
                        <MenuItem key={option} value={option}>
                          {isMultiSelect && (
                            <Checkbox checked={formData[field]?.includes(option) || false} />
                          )}
                          <ListItemText primary={option} />
                        </MenuItem>
                      ))}
                    </Select>
                  </Box>
                </Grid>
              );
            })}
          </Grid>

          <Button
            type="submit"
            variant="contained"
            sx={{
              mt: 3,
              backgroundColor: "#fcd535",
              color: "#000",
              '&:hover': { backgroundColor: "#fccd17" },
              textTransform: 'none'
            }}
          >
            Build Model
          </Button>
        </form>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}
    </Box>
  );
};

export default ModelTrainingForm;