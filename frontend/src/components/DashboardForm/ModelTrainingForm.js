import React, { useState, useEffect } from "react";
import { Box, Paper, Grid, Select, MenuItem, Checkbox, ListItemText, Button, Alert, Typography, CircularProgress, TextField, Link } from "@mui/material";

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
  const [dateRanges, setDateRanges] = useState({}); // Store date ranges for each date column
  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  
  // Define which fields should be multi-select
  const multiSelectFields = ['control_variable', 'media', 'mediaSpend', 'organic_media'];
  
  const [formData, setFormData] = useState({
    control_variable: [],
    population: "",
    mediaSpend: [], // Switched position with media
    date: "",
    dateRange: { start_date: "", end_date: "" }, // Add date range fields
    geo: "",
    kpi: "",
    revenuePerKpi: "",
    media: [], // Switched position with mediaSpend
    organic_media: [], // New organic media field
  });

  // Function to extract channel names from spend columns
  const extractChannelNames = (spendColumns) => {
    return spendColumns.map(spendColumn => {
      // Remove common spend-related suffixes to get channel name
      return spendColumn.replace(/_(spend|spends|cost|costs)$/i, '');
    });
  };

  // Function to get spend columns
  const getSpendColumns = () => {
    return columns.filter(col => {
      const colStr = String(col).toLowerCase();
      return colStr.includes('spend') || colStr.includes('spends') || 
             colStr.includes('cost') || colStr.includes('costs');
    });
  };

  // Function to get all channel-related columns (not just extracted names)
  const getAllChannelOptions = () => {
    return columns.filter(col => {
      const colStr = String(col).toLowerCase();
      // Include columns that contain channel-related keywords
      return colStr.includes('click') || colStr.includes('impression') || 
             colStr.includes('reach') || colStr.includes('engagement') ||
             colStr.includes('spend') || colStr.includes('cost')
    });
  };

  // Function to get organic media related columns
  const getOrganicMediaOptions = () => {
    return columns.filter(col => {
      const colStr = String(col).toLowerCase();
      // Include columns that might be organic media related
      return colStr.includes('organic') || colStr.includes('seo') || 
             colStr.includes('earned') || colStr.includes('viral') ||
             colStr.includes('referral') || colStr.includes('direct') ||
             colStr.includes('social') || colStr.includes('email');
    });
  };

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
      return channelName.replace(/_(clicks|spend|spends|impressions|impression|views|ctr|cpc|cpm|cost|costs)$/i, '');
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

  // Validation function for date ranges
  const validateDateRange = () => {
    const { date, dateRange } = formData;
    
    if (!date || !dateRange.start_date || !dateRange.end_date) {
      return { isValid: true, message: "" };
    }
    
    const selectedDateRange = dateRanges[date];
    if (!selectedDateRange) {
      return { isValid: true, message: "" };
    }
    
    const userStartDate = new Date(dateRange.start_date);
    const userEndDate = new Date(dateRange.end_date);
    const dataStartDate = new Date(selectedDateRange.start_date);
    const dataEndDate = new Date(selectedDateRange.end_date);
    
    if (userStartDate < dataStartDate) {
      return {
        isValid: false,
        message: `Start date cannot be earlier than ${selectedDateRange.start_date}`
      };
    }
    
    if (userEndDate > dataEndDate) {
      return {
        isValid: false,
        message: `End date cannot be later than ${selectedDateRange.end_date}`
      };
    }
    
    if (userStartDate > userEndDate) {
      return {
        isValid: false,
        message: `Start date cannot be later than end date`
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
    // Static logic: For media, show all options that contain channel names
    if (field === 'media') {
      return getAllChannelOptions();
    }

    // Static logic: For mediaSpend, always show all spend-related columns
    if (field === 'mediaSpend') {
      return getSpendColumns();
    }

    // // Static logic: For organic_media, show organic media related columns
    // if (field === 'organic_media') {
    //   return getOrganicMediaOptions();
    // }

    // Original logic for other fields (with exclusions)
    const selectedInOtherFields = Object.entries(formData)
      .filter(([key]) => key !== field && key !== 'dateRange') // Exclude dateRange from comparison
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
  };

  // Handle date column selection change
  const handleDateColumnChange = (selectedDateColumn) => {
    const selectedRange = dateRanges[selectedDateColumn];
    setFormData(prev => ({
      ...prev,
      date: selectedDateColumn,
      dateRange: selectedRange ? {
        start_date: selectedRange.start_date,
        end_date: selectedRange.end_date
      } : { start_date: "", end_date: "" }
    }));
  };

  // Handle date range input changes
  const handleDateRangeChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      dateRange: {
        ...prev.dateRange,
        [field]: value
      }
    }));
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
          const sortedOptions = filteredOptions.sort((a, b) => a.localeCompare(b));
          setColumns(sortedOptions);
          
          // Extract and set date ranges if they exist in the response
          if (data.date_ranges) {
            setDateRanges(data.date_ranges);
          }
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
      dateRange: { start_date: "", end_date: "" },
      geo: "",
      kpi: "",
      revenuePerKpi: "",
      media: [], // Switched position
      organic_media: [], // Reset organic media field
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
    const mediaValidation = validateMediaChannels();
    if (!mediaValidation.isValid) {
      setError(mediaValidation.message);
      return;
    }
    
    // Validate date ranges before submission
    const dateValidation = validateDateRange();
    if (!dateValidation.isValid) {
      setError(dateValidation.message);
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

  // Real-time validation effect for media channels
  useEffect(() => {
    const mediaValidation = validateMediaChannels();
    if (!mediaValidation.isValid && (formData.media.length > 0 || formData.mediaSpend.length > 0)) {
      // Only show validation error if user has made selections
      if (error !== mediaValidation.message) {
        setError(mediaValidation.message);
      }
    } else if (mediaValidation.isValid && error && error.includes('Media')) {
      // Clear media-related errors when validation passes
      setError("");
    }
  }, [formData.media, formData.mediaSpend]);

  // Real-time validation effect for date ranges
  useEffect(() => {
    const dateValidation = validateDateRange();
    if (!dateValidation.isValid && formData.date && (formData.dateRange.start_date || formData.dateRange.end_date)) {
      if (error !== dateValidation.message) {
        setError(dateValidation.message);
      }
    } else if (dateValidation.isValid && error && (error.includes('date') || error.includes('Date'))) {
      // Clear date-related errors when validation passes
      setError("");
    }
  }, [formData.date, formData.dateRange]);

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

  // Get current date range info for display
  const getCurrentDateRange = () => {
    if (formData.date && dateRanges[formData.date]) {
      return dateRanges[formData.date];
    }
    return null;
  };

  return (
    <Box sx={{ width: '800px', margin: '0 auto' }}>
      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* 1. Geo */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ mb: 2 }}>
                <label>
                  Geo<span style={{ color: 'red' }}>*</span>
                </label>
                <Select
                  name="geo"
                  value={formData.geo || ""}
                  onChange={(e) => setFormData(prev => ({ ...prev, geo: e.target.value }))}
                  fullWidth
                  size="small"
                >
                  {getAvailableOptions('geo').map((option) => (
                    <MenuItem key={option} value={option}>
                      <ListItemText primary={option} />
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            </Grid>

            {/* Date Column Selection (needed for date range fields) */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ mb: 2 }}>
                <label>
                  Date Column<span style={{ color: 'red' }}>*</span>
                </label>
                <Select
                  name="date"
                  value={formData.date || ""}
                  onChange={(e) => handleDateColumnChange(e.target.value)}
                  fullWidth
                  size="small"
                >
                  {getAvailableOptions('date').map((option) => (
                    <MenuItem key={option} value={option}>
                      <ListItemText primary={option} />
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            </Grid>

            {/* 2. Start Date */}
            {formData.date && getCurrentDateRange() && (
              <Grid item xs={12} sm={6}>
                <Box sx={{ mb: 2 }}>
                  <label>
                    Start Date<span style={{ color: 'red' }}>*</span>
                  </label>
                  <TextField
                    type="date"
                    value={formData.dateRange.start_date}
                    onChange={(e) => handleDateRangeChange('start_date', e.target.value)}
                    fullWidth
                    size="small"
                    inputProps={{
                      min: getCurrentDateRange().start_date,
                      max: getCurrentDateRange().end_date,
                    }}
                    helperText={`Available range: ${getCurrentDateRange().start_date} to ${getCurrentDateRange().end_date}`}
                  />
                </Box>
              </Grid>
            )}

            {/* 3. End Date */}
            {formData.date && getCurrentDateRange() && (
              <Grid item xs={12} sm={6}>
                <Box sx={{ mb: 2 }}>
                  <label>
                    End Date<span style={{ color: 'red' }}>*</span>
                  </label>
                  <TextField
                    type="date"
                    value={formData.dateRange.end_date}
                    onChange={(e) => handleDateRangeChange('end_date', e.target.value)}
                    fullWidth
                    size="small"
                    inputProps={{
                      min: getCurrentDateRange().start_date,
                      max: getCurrentDateRange().end_date,
                    }}
                    helperText={`Available range: ${getCurrentDateRange().start_date} to ${getCurrentDateRange().end_date}`}
                  />
                </Box>
              </Grid>
            )}

            {/* 4. Media Spend */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ mb: 2 }}>
                <label>
                  Media Spend<span style={{ color: 'red' }}>*</span>
                </label>
                <Select
                  name="mediaSpend"
                  multiple
                  value={formData.mediaSpend || []}
                  onChange={(e) => setFormData(prev => ({ ...prev, mediaSpend: e.target.value }))}
                  fullWidth
                  size="small"
                  renderValue={(selected) => selected.join(", ")}
                >
                  {getAvailableOptions('mediaSpend').map((option) => (
                    <MenuItem key={option} value={option}>
                      <Checkbox checked={formData.mediaSpend?.includes(option) || false} />
                      <ListItemText primary={option} />
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            </Grid>

            {/* 5. Media */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ mb: 2 }}>
                <label>
                  Media<span style={{ color: 'red' }}>*</span>
                </label>
                <Select
                  name="media"
                  multiple
                  value={formData.media || []}
                  onChange={(e) => setFormData(prev => ({ ...prev, media: e.target.value }))}
                  fullWidth
                  size="small"
                  renderValue={(selected) => selected.join(", ")}
                >
                  {getAvailableOptions('media').map((option) => (
                    <MenuItem key={option} value={option}>
                      <Checkbox checked={formData.media?.includes(option) || false} />
                      <ListItemText primary={option} />
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            </Grid>

            {/* 6. Organic Media */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ mb: 2 }}>
                <label>
                  Organic Media
                </label>
                <Select
                  name="organic_media"
                  multiple
                  value={formData.organic_media || []}
                  onChange={(e) => setFormData(prev => ({ ...prev, organic_media: e.target.value }))}
                  fullWidth
                  size="small"
                  renderValue={(selected) => selected.join(", ")}
                >
                  {getAvailableOptions('organic_media').map((option) => (
                    <MenuItem key={option} value={option}>
                      <Checkbox checked={formData.organic_media?.includes(option) || false} />
                      <ListItemText primary={option} />
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            </Grid>

            {/* 7. Control Variable */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ mb: 2 }}>
                <label>
                  Control Variable
                </label>
                <Select
                  name="control_variable"
                  multiple
                  value={formData.control_variable || []}
                  onChange={(e) => setFormData(prev => ({ ...prev, control_variable: e.target.value }))}
                  fullWidth
                  size="small"
                  renderValue={(selected) => selected.join(", ")}
                >
                  {getAvailableOptions('control_variable').map((option) => (
                    <MenuItem key={option} value={option}>
                      <Checkbox checked={formData.control_variable?.includes(option) || false} />
                      <ListItemText primary={option} />
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            </Grid>

            {/* 8. Population */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ mb: 2 }}>
                <label>
                  Population
                </label>
                <Select
                  name="population"
                  value={formData.population || ""}
                  onChange={(e) => setFormData(prev => ({ ...prev, population: e.target.value }))}
                  fullWidth
                  size="small"
                >
                  {getAvailableOptions('population').map((option) => (
                    <MenuItem key={option} value={option}>
                      <ListItemText primary={option} />
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            </Grid>

            {/* 9. KPI */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ mb: 2 }}>
                <label>
                  Kpi<span style={{ color: 'red' }}>*</span>
                </label>
                <Select
                  name="kpi"
                  value={formData.kpi || ""}
                  onChange={(e) => setFormData(prev => ({ ...prev, kpi: e.target.value }))}
                  fullWidth
                  size="small"
                >
                  {getAvailableOptions('kpi').map((option) => (
                    <MenuItem key={option} value={option}>
                      <ListItemText primary={option} />
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            </Grid>

            {/* 10. Revenue Per KPI */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ mb: 2 }}>
                <label>
                  Revenue Per Kpi
                </label>
                <Select
                  name="revenuePerKpi"
                  value={formData.revenuePerKpi || ""}
                  onChange={(e) => setFormData(prev => ({ ...prev, revenuePerKpi: e.target.value }))}
                  fullWidth
                  size="small"
                >
                  {getAvailableOptions('revenuePerKpi').map((option) => (
                    <MenuItem key={option} value={option}>
                      <ListItemText primary={option} />
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            </Grid>
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
        {error.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
          if (/https?:\/\/[^\s]+/.test(part)) {
            return (
              <Link
                key={index}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: 'inherit',
                  textDecoration: 'underline',
                  '&:hover': {
                    color: 'primary.dark'
                  }
                }}
              >
                {part}
              </Link>
            );
          }
          return part;
        })}
      </Alert>
    )}
    </Box>
  );
};

export default ModelTrainingForm;