import React, { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { Box, Button } from "@mui/material";
import InsightsInitialForm from "./InsightsInitialForm";
import ModelTrainingForm from "./ModelTrainingForm";
import EDAReport from "../EDAReport";

const STORAGE_KEYS = {
  SHOW_EDA: 'insightsFlow_showEDA',
  INITIAL_DATA: 'insightsFlow_initialData'
};

const InsightsFlow = ({ setInitialData, initialData }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [showEDAReport, setShowEDAReport] = useState(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.SHOW_EDA);
        return stored ? JSON.parse(stored) : false;
    });

    // Initialize state from localStorage or props
    useEffect(() => {
        const storedData = localStorage.getItem(STORAGE_KEYS.INITIAL_DATA);
        if (storedData) {
            const parsedData = JSON.parse(storedData);
            setInitialData(parsedData);
        }
    }, [setInitialData]);

    // Persist state changes to localStorage
    useEffect(() => {
        localStorage.setItem(STORAGE_KEYS.SHOW_EDA, JSON.stringify(showEDAReport));
    }, [showEDAReport]);

    useEffect(() => {
        if (initialData) {
            localStorage.setItem(STORAGE_KEYS.INITIAL_DATA, JSON.stringify(initialData));
        }
    }, [initialData]);

    // Clean up localStorage when component unmounts
    useEffect(() => {
        return () => {
            // Only clean up if navigating away from insights flow
            if (!location.pathname.includes('/dashboard/insights')) {
                localStorage.removeItem(STORAGE_KEYS.SHOW_EDA);
                localStorage.removeItem(STORAGE_KEYS.INITIAL_DATA);
            }
        };
    }, [location]);

    const handleEDAComplete = (data) => {
        setInitialData(data);
        setShowEDAReport(true);
    };

    const handleTrainModelClick = () => {
        navigate('/dashboard/mmm-model-training');
    };
  
    const handleDownloadSample = () => {
        const link = document.createElement('a');
        link.href = `${process.env.PUBLIC_URL}/geo_media.csv`;
        link.download = 'geo_media.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    return (
        <Routes>
            <Route 
                path="/" 
                element={
                    <Box>
                        <Box sx={{ 
                            display: 'flex', 
                            alignItems: 'flex-start',
                            justifyContent: 'center',
                            margin: '0 auto', 
                        }}>
                            <InsightsInitialForm 
                                onEDAComplete={handleEDAComplete}
                            />
                            <Button
                                variant="contained"
                                onClick={handleDownloadSample}
                                sx={{
                                    bgcolor: 'primary.main',
                                    '&:hover': {
                                      bgcolor: 'primary.dark'
                                    },
                                    m: "12px 0 0 12px"
                                  }}
                            >
                             Sample Data
                            </Button>
                        </Box>
                        {(showEDAReport && initialData?.project_id) && (
                            <Box mt={3}>
                                <EDAReport selectedProject={initialData.project_id} />
                                <Box mt={3} display="flex" justifyContent="center">
                                    <Button
                                        type="submit"
                                        variant="contained"
                                        sx={{
                                            backgroundColor: "#ffdd33",
                                            color: "#000",
                                            border: '1px solid #000000',
                                            borderRadius: '22px',
                                            textTransform: 'none'
                                        }}
                                        onClick={handleTrainModelClick}
                                    >
                                        Train Model
                                    </Button>
                                </Box>
                            </Box>
                        )}
                    </Box>
                } 
            />
            <Route 
                path="/mmm-model-training" 
                element={<ModelTrainingForm initialData={initialData} />} 
            />
        </Routes>
    );
};
  
export default InsightsFlow;