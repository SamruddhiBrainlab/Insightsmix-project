import React, { useState, useEffect } from "react";
import { 
  Box, Paper, Grid, Select, MenuItem, Checkbox, ListItemText, Button, 
  Alert, Typography, CircularProgress, TextField, Link, Divider,
  FormControlLabel, Switch, Collapse, Card, CardContent, Chip,
  Avatar, Stack, Accordion, AccordionSummary, AccordionDetails,
  IconButton, FormControl, InputLabel
} from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import TuneIcon from '@mui/icons-material/Tune';
import SettingsIcon from '@mui/icons-material/Settings';
import { Brain as BrainIcon } from 'lucide-react';

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
  const [dateRanges, setDateRanges] = useState({});
  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  
  // Custom Priors State
  const [customPriorsEnabled, setCustomPriorsEnabled] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [channelPriors, setChannelPriors] = useState({});
  
  const multiSelectFields = ['control_variable', 'media', 'mediaSpend', 'organic_media'];
  
  const [formData, setFormData] = useState({
    control_variable: [],
    population: "",
    mediaSpend: [],
    date: "",
    dateRange: { start_date: "", end_date: "" },
    geo: "",
    kpi: "",
    revenuePerKpi: "",
    media: [],
    organic_media: [],
  });

  // Extract channel name from spend column
  const extractChannelName = (spendColumn) => {
    return spendColumn.replace(/_(spend|spends|cost|costs)$/i, '');
  };

  // Get channel options from mediaSpend selections
  const getChannelOptionsFromMediaSpend = () => {
    return formData.mediaSpend.map(spendColumn => {
      const channelName = extractChannelName(spendColumn);
      return {
        name: channelName,
        spendColumn: spendColumn,
        color: getColorForChannel(channelName),
        category: 'Paid Media'
      };
    });
  };

  // Generate color for channel
  const getColorForChannel = (channelName) => {
    const colors = ['#1976d2', '#9c27b0', '#f57c00', '#388e3c', '#d32f2f', '#0288d1', '#7b1fa2', '#c2185b'];
    const hash = channelName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Get channel info
  const getChannelInfo = (channelName) => {
    const channelOptions = getChannelOptionsFromMediaSpend();
    return channelOptions.find(c => c.name === channelName) || {
      name: channelName,
      color: '#757575',
      category: 'Unknown'
    };
  };

  // Toggle channel selection
  const toggleChannelSelection = (channelName) => {
    setSelectedChannels(prev => {
      if (prev.includes(channelName)) {
        // Remove channel
        const updated = prev.filter(c => c !== channelName);
        // Also remove from channelPriors
        const { [channelName]: removed, ...rest } = channelPriors;
        setChannelPriors(rest);
        return updated;
      } else {
        // Add channel with default priors
        setChannelPriors(prev => ({
          ...prev,
          [channelName]: { mean: 0.2, sigma: 0.9 }
        }));
        return [...prev, channelName];
      }
    });
  };

  // Update channel prior
  const updateChannelPrior = (channelName, field, value) => {
    setChannelPriors(prev => ({
      ...prev,
      [channelName]: {
        ...prev[channelName],
        [field]: parseFloat(value) || 0
      }
    }));
  };

  // Watch mediaSpend changes and update available channels for priors
  useEffect(() => {
    // Remove selected channels that are no longer in mediaSpend
    const currentChannelNames = formData.mediaSpend.map(extractChannelName);
    setSelectedChannels(prev => prev.filter(ch => currentChannelNames.includes(ch)));
  }, [formData.mediaSpend]);

  const extractChannelNames = (spendColumns) => {
    return spendColumns.map(spendColumn => {
      return spendColumn.replace(/_(spend|spends|cost|costs)$/i, '');
    });
  };

  const getSpendColumns = () => {
    return columns.filter(col => {
      const colStr = String(col).toLowerCase();
      return colStr.includes('spend') || colStr.includes('spends') || 
             colStr.includes('cost') || colStr.includes('costs');
    });
  };

  const getAllChannelOptions = () => {
    return columns.filter(col => {
      const colStr = String(col).toLowerCase();
      return colStr.includes('click') || colStr.includes('impression') || 
             colStr.includes('reach') || colStr.includes('engagement') ||
             colStr.includes('spend') || colStr.includes('cost');
    });
  };

  const getOrganicMediaOptions = () => {
    return columns.filter(col => {
      const colStr = String(col).toLowerCase();
      return colStr.includes('organic') || colStr.includes('seo') || 
             colStr.includes('earned') || colStr.includes('viral') ||
             colStr.includes('referral') || colStr.includes('direct') ||
             colStr.includes('social') || colStr.includes('email');
    });
  };

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
    
    const getChannelBaseName = (channelName) => {
      return channelName.replace(/_(clicks|spend|spends|impressions|impression|views|ctr|cpc|cpm|cost|costs)$/i, '');
    };
    
    const mediaBaseNames = media.map(getChannelBaseName).sort();
    const mediaSpendBaseNames = mediaSpend.map(getChannelBaseName).sort();
    
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
    if (field === 'media') {
      return getAllChannelOptions();
    }

    if (field === 'mediaSpend') {
      return getSpendColumns();
    }

    const selectedInOtherFields = Object.entries(formData)
      .filter(([key]) => key !== field && key !== 'dateRange')
      .flatMap(([key, value]) => {
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

  const handleDateRangeChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      dateRange: {
        ...prev.dateRange,
        [field]: value
      }
    }));
  };

  const resetForm = () => {
    setFormData({
      control_variable: [],
      population: "",
      mediaSpend: [],
      date: "",
      dateRange: { start_date: "", end_date: "" },
      geo: "",
      kpi: "",
      revenuePerKpi: "",
      media: [],
      organic_media: [],
    });
    setCustomPriorsEnabled(false);
    setSelectedChannels([]);
    setChannelPriors({});
    setJobId(null);
    setIsJobCompleted(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const mediaValidation = validateMediaChannels();
    if (!mediaValidation.isValid) {
      setError(mediaValidation.message);
      return;
    }
    
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
      userEmail: user.email,
      customPriors: customPriorsEnabled ? {
        enabled: true,
        priors: channelPriors
      } : {
        enabled: false,
        priors: {}
      }
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
      localStorage.removeItem('jobId');
    }
  }, [isLoading]);

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
          console.log(data.options);
          const filteredOptions = (data.options || []).filter(option => 
            option !== null && option !== undefined && option !== "" && option !== "Unnamed: 0"
          );
          const sortedOptions = filteredOptions.sort((a, b) => a.localeCompare(b));
          setColumns(sortedOptions);
          
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

  useEffect(() => {
    const mediaValidation = validateMediaChannels();
    if (!mediaValidation.isValid && (formData.media.length > 0 || formData.mediaSpend.length > 0)) {
      if (error !== mediaValidation.message) {
        setError(mediaValidation.message);
      }
    } else if (mediaValidation.isValid && error && error.includes('Media')) {
      setError("");
    }
  }, [formData.media, formData.mediaSpend]);

  useEffect(() => {
    const dateValidation = validateDateRange();
    if (!dateValidation.isValid && formData.date && (formData.dateRange.start_date || formData.dateRange.end_date)) {
      if (error !== dateValidation.message) {
        setError(dateValidation.message);
      }
    } else if (dateValidation.isValid && error && (error.includes('date') || error.includes('Date'))) {
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

  const getCurrentDateRange = () => {
    if (formData.date && dateRanges[formData.date]) {
      return dateRanges[formData.date];
    }
    return null;
  };

  const channelOptions = getChannelOptionsFromMediaSpend();

  return (
    <Box sx={{ width: '800px', margin: '0 auto' }}>
      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
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

            {formData.date && getCurrentDateRange() && (
              <>
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
                      helperText={`Available: ${getCurrentDateRange().start_date} to ${getCurrentDateRange().end_date}`}
                    />
                  </Box>
                </Grid>

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
                      helperText={`Available: ${getCurrentDateRange().start_date} to ${getCurrentDateRange().end_date}`}
                    />
                  </Box>
                </Grid>
              </>
            )}

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

            <Grid item xs={12} sm={6}>
              <Box sx={{ mb: 2 }}>
                <label>Organic Media</label>
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

            <Grid item xs={12} sm={6}>
              <Box sx={{ mb: 2 }}>
                <label>Control Variable</label>
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

            <Grid item xs={12} sm={6}>
              <Box sx={{ mb: 2 }}>
                <label>Population</label>
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

            <Grid item xs={12} sm={6}>
              <Box sx={{ mb: 2 }}>
                <label>
                  KPI<span style={{ color: 'red' }}>*</span>
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

            <Grid item xs={12} sm={6}>
              <Box sx={{ mb: 2 }}>
                <label>Revenue Per KPI</label>
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

          <Divider sx={{ marginY: 4 }} />

          {/* Custom Priors Section */}
          <Box sx={{ marginBottom: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <BrainIcon size={24} color="#9c27b0" />
                <Typography variant="h5" component="h3" sx={{ fontWeight: 'bold' }}>
                  Custom Bayesian Priors
                </Typography>
              </Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={customPriorsEnabled}
                    onChange={(e) => setCustomPriorsEnabled(e.target.checked)}
                    color="primary"
                  />
                }
                label="Enable Custom Priors"
              />
            </Box>

            <Collapse in={customPriorsEnabled}>
              <Alert severity="info" sx={{ marginBottom: 3 }}>
                Set custom prior distributions for your media channels to incorporate domain knowledge into your MMM model.
                Default values: Mean = 0.2, Standard Deviation = 0.9
              </Alert>

              {formData.mediaSpend.length === 0 && (
                <Alert severity="warning" sx={{ marginBottom: 3 }}>
                  Please select Media Spend channels first to configure custom priors.
                </Alert>
              )}

              {formData.mediaSpend.length > 0 && (
                <>
                  <Card variant="outlined" sx={{ marginBottom: 3 }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <TuneIcon />
                          Add Channels for Custom Priors
                        </Typography>
                        <Chip 
                          label={`${selectedChannels.length} Channel${selectedChannels.length !== 1 ? 's' : ''}`} 
                          color={selectedChannels.length > 0 ? "primary" : "default"}
                          size="small"
                        />
                      </Box>

                      <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} md={8}>
                          <FormControl fullWidth>
                            <InputLabel>Select Media Channel</InputLabel>
                            <Select
                              label="Select Media Channel"
                              value=""
                              onChange={(e) => {
                                if (e.target.value && !selectedChannels.includes(e.target.value)) {
                                  toggleChannelSelection(e.target.value);
                                }
                              }}
                            >
                              {channelOptions
                                .filter(channel => !selectedChannels.includes(channel.name))
                                .map((channel) => (
                                  <MenuItem key={channel.name} value={channel.name}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                      <Avatar sx={{ bgcolor: channel.color, width: 24, height: 24 }}>
                                        <Typography sx={{ fontSize: '10px', fontWeight: 'bold', color: 'white' }}>
                                          {channel.name.slice(0, 2).toUpperCase()}
                                        </Typography>
                                      </Avatar>
                                      <Box>
                                        <Typography variant="body2">{channel.name}</Typography>
                                        <Typography variant="caption" color="textSecondary">
                                          {channel.category}
                                        </Typography>
                                      </Box>
                                    </Box>
                                  </MenuItem>
                                ))
                              }
                              {channelOptions.filter(channel => !selectedChannels.includes(channel.name)).length === 0 && (
                                <MenuItem disabled>
                                  <Typography variant="body2" color="textSecondary">
                                    All channels have been added
                                  </Typography>
                                </MenuItem>
                              )}
                            </Select>
                          </FormControl>
                        </Grid>
                      </Grid>

                      {selectedChannels.length > 0 && (
                        <Box sx={{ mt: 2, p: 2, bgcolor: '#f8f9fa', borderRadius: 1 }}>
                          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                            Selected Channels:
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {selectedChannels.map((channelName) => {
                              const channelInfo = getChannelInfo(channelName);
                              return (
                                <Chip
                                  key={channelName}
                                  size="small"
                                  avatar={
                                    <Avatar sx={{ bgcolor: channelInfo.color, width: 20, height: 20 }}>
                                      <Typography sx={{ fontSize: '8px', fontWeight: 'bold', color: 'white' }}>
                                        {channelInfo.name.slice(0, 2).toUpperCase()}
                                      </Typography>
                                    </Avatar>
                                  }
                                  label={channelName}
                                  onDelete={() => toggleChannelSelection(channelName)}
                                  color="primary"
                                  variant="outlined"
                                />
                              );
                            })}
                          </Box>
                        </Box>
                      )}
                    </CardContent>
                  </Card>

                  {selectedChannels.length > 0 && (
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6" sx={{ marginBottom: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                          <SettingsIcon />
                          Configure Prior Distributions
                        </Typography>

                        <Stack spacing={2}>
                          {selectedChannels.map((channelName) => {
                            const channelInfo = getChannelInfo(channelName);
                            const priors = channelPriors[channelName] || { mean: 0.2, sigma: 0.9 };
                            
                            return (
                              <Accordion key={channelName} elevation={0} sx={{ border: '1px solid #e0e0e0' }}>
                                <AccordionSummary
                                  expandIcon={<ExpandMoreIcon />}
                                  sx={{ 
                                    backgroundColor: '#fafafa',
                                    '&:hover': { backgroundColor: '#f0f0f0' }
                                  }}
                                >
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                                    <Avatar sx={{ bgcolor: channelInfo.color, width: 32, height: 32 }}>
                                      <Typography sx={{ fontSize: '12px', fontWeight: 'bold' }}>
                                        {channelInfo.name.slice(0, 2).toUpperCase()}
                                      </Typography>
                                    </Avatar>
                                    <Box sx={{ flex: 1 }}>
                                      <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                                        {channelInfo.name}
                                      </Typography>
                                      <Typography variant="caption" color="textSecondary">
                                        μ: {priors.mean}, σ: {priors.sigma}
                                      </Typography>
                                    </Box>
                                    <IconButton
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleChannelSelection(channelName);
                                      }}
                                      sx={{ color: 'error.main' }}
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </Box>
                                </AccordionSummary>
                                <AccordionDetails>
                                  <Grid container spacing={3}>
                                    <Grid item xs={12} md={6}>
                                      <TextField
                                        fullWidth
                                        label="roi_mu"
                                        type="number"
                                        value={priors.mean}
                                        onChange={(e) => updateChannelPrior(channelName, 'mean', e.target.value)}
                                        inputProps={{ 
                                          step: 0.01,
                                          min: 0
                                        }}
                                        helperText="Mu for ROI prior."
                                        size="small"
                                      />
                                    </Grid>
                                    <Grid item xs={12} md={6}>
                                      <TextField
                                        fullWidth
                                        label="roi_sigma"
                                        type="number"
                                        value={priors.sigma}
                                        onChange={(e) => updateChannelPrior(channelName, 'sigma', e.target.value)}
                                        inputProps={{ 
                                          step: 0.01,
                                          min: 0.01
                                        }}
                                        helperText="Sigma for ROI prior."
                                        size="small"
                                      />
                                    </Grid>
                                  </Grid>
                                </AccordionDetails>
                              </Accordion>
                            );
                          })}
                        </Stack>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </Collapse>
          </Box>

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