import React, { useState, useRef, useEffect } from 'react';

const ChatBot = () => {
  console.log('ChatBot rendering...');
  
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const user = { email: "samruddhi.talekar@brainlabsdigital.com" }; // Mock user for demo
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [projects, setProjects] = useState([]);
  const [models, setModels] = useState([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [showModelSelection, setShowModelSelection] = useState(false);
  const [showModelSwitching, setShowModelSwitching] = useState(false);
  const [availableModelsForSwitching, setAvailableModelsForSwitching] = useState([]);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // New state for chatbot size
  const [chatSize, setChatSize] = useState("small");
  const [isResizing, setIsResizing] = useState(false);
  const [customSize, setCustomSize] = useState({ width: 384, height: 500 });
  const toggleSize = () => {
      setChatSize((prev) => (prev === "fullscreen" ? "small" : "fullscreen"));
    };
  const resizeRef = useRef(null);

  // Configuration - adjust these based on your needs
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

  // Size configurations
  const sizeConfigs = {
    small: { width: 384, height: 500 },
    large: { width: 500, height: 650 },
    fullscreen: { width: '90vw', height: '90vh', maxWidth: '1200px', maxHeight: '800px' }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current && selectedProject && selectedModel && !showModelSelection && !showModelSwitching) {
      inputRef.current.focus();
    }
  }, [isOpen, selectedProject, selectedModel, showModelSelection, showModelSwitching]);

  // Resize functionality
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      
      const chatElement = resizeRef.current;
      if (!chatElement) return;

      const rect = chatElement.getBoundingClientRect();
      const newWidth = Math.max(300, Math.min(window.innerWidth - 50, e.clientX - rect.left + 20));
      const newHeight = Math.max(400, Math.min(window.innerHeight - 100, rect.bottom - e.clientY + 20));
      
      setCustomSize({ width: newWidth, height: newHeight });
      setChatSize('custom');
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const getCurrentSize = () => {
    if (chatSize === 'custom') return customSize;
    return sizeConfigs[chatSize];
  };

  const fetchProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const response = await fetch(`${backendUrl}/api/get-all-projects`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const projectIds = await response.json();
      setProjects(projectIds);
    } catch (error) {
      console.error('Error fetching projects:', error);
      setProjects([]);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const fetchModels = async (engineId) => {
    setIsLoadingModels(true);
    try {
      const response = await fetch(`${backendUrl}/api/get-models-project?engine_id=${engineId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setModels(data.data_store_ids || []);
    } catch (error) {
      console.error('Error fetching models:', error);
      setModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const createNewSession = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/new-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_email: user.email,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'success') {
        setSessionId(data.session_id);
        return data.session_id;
      } else {
        throw new Error(data.error || 'Failed to create session');
      }
    } catch (error) {
      console.error('Error creating new session:', error);
      return null;
    }
  };

  // Function to detect if response contains switchable models
  const detectModelSwitchingResponse = (data) => {
    return data.data_store_ids && 
           Array.isArray(data.data_store_ids) && 
           data.data_store_ids.length > 0 &&
           data.bot_response === ""; // Empty bot response indicates model switching
  };

  // Handle model switching selection
  const handleModelSwitch = (newModelId) => {
    setSelectedModel(newModelId);
    setShowModelSwitching(false);
    
    // Remove the model switching message and add confirmation message
    setMessages(prev => {
      const filteredMessages = prev.filter(msg => !msg.showModelSwitching);
      return [...filteredMessages, {
        id: Date.now(),
        text: `✅ Switched to model: ${getDisplayName(newModelId)}. You can continue our conversation now.`,
        sender: 'bot',
        timestamp: new Date(),
      }];
    });
  };

  // Cancel model switching
  const cancelModelSwitching = () => {
    setShowModelSwitching(false);
    setAvailableModelsForSwitching([]);
    
    // Remove the model switching message and add cancellation message
    setMessages(prev => {
      const filteredMessages = prev.filter(msg => !msg.showModelSwitching);
      return [...filteredMessages, {
        id: Date.now(),
        text: `Continuing with current model: ${getDisplayName(selectedModel)}`,
        sender: 'bot',
        timestamp: new Date(),
      }];
    });
  };

  const sendMessage = async (message) => {
    if (!message.trim() || !selectedProject || !selectedModel) return;

    const userMessage = {
      id: Date.now(),
      text: message,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        currentSessionId = await createNewSession();
        if (!currentSessionId) {
          throw new Error('Failed to create session');
        }
      }

      const response = await fetch(`${backendUrl}/api/qa-chatbot-v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_query: message,
          user_email: user.email,
          session_id: currentSessionId,
          app_id: selectedProject,
          data_store_ids: [selectedModel],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Backend response:', data);

      if (data.status === 'success') {
        // Handle session ID updates
        let responseSessionId = null;
        
        if (data.session_id) {
          responseSessionId = data.session_id;
        } else if (data.bot_response && typeof data.bot_response === 'object' && data.bot_response.session_id) {
          responseSessionId = data.bot_response.session_id;
        }
        
        if (responseSessionId && responseSessionId !== sessionId) {
          console.log(`Updating session ID from ${sessionId} to ${responseSessionId}`);
          setSessionId(responseSessionId);
        }

        // Check if this is a model switching response
        if (detectModelSwitchingResponse(data)) {
          setAvailableModelsForSwitching(data.data_store_ids);
          setShowModelSwitching(true);
          
          const switchingMessage = {
            id: Date.now() + 1,
            text: `I found ${data.data_store_ids.length} available models for you to switch to. Please select one from the options below:`,
            sender: 'bot',
            timestamp: new Date(),
            showModelSwitching: true, // Add this flag to identify model switching messages
            availableModels: data.data_store_ids // Store the models in the message
          };
          setMessages(prev => [...prev, switchingMessage]);
        } else {
          // Add messages array to store all bot responses
          const botMessages = [];
          
          // Add rephrased query message if it exists
          if (data.rephrased_query && data.rephrased_query.length > 0 && data.rephrased_query !== 'null') {
            const rephrasedText = Array.isArray(data.rephrased_query) 
              ? data.rephrased_query[0] 
              : data.rephrased_query;
            
            const rephrasedMessage = {
              id: Date.now() + 1,
              text: `🔍 Rephrased query:\n**${rephrasedText}**`,
              sender: 'bot',
              timestamp: new Date(),
              isRephrased: true,
            };
            botMessages.push(rephrasedMessage);
          }

          // Regular response handling
          let responseText;
          if (typeof data.bot_response === 'string') {
            responseText = data.bot_response;
          } else if (data.bot_response && data.bot_response.response) {
            responseText = data.bot_response.response;
          }
          else if (data.bot_response && data.bot_response.explanation && data.bot_response.result){
          responseText = `${data.bot_response.result}\n${data.bot_response.explanation}`;
          } else if (data.bot_response && data.bot_response.result){
            responseText = data.bot_response.result;
          } else {
            responseText = 'I received your message but couldn\'t process the response format.';
          }

          const botMessage = {
            id: Date.now() + 2,
            text: responseText,
            sender: 'bot',
            timestamp: new Date(),
          };
          botMessages.push(botMessage);

          setMessages(prev => [...prev, ...botMessages]);
        }
      } else {
        throw new Error(data.error || 'Failed to get response');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      
      const errorMessage = {
        id: Date.now() + 1,
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'bot',
        timestamp: new Date(),
        isError: true,
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = () => {
    sendMessage(inputValue);
  };

  const handleProjectSelect = async (projectId) => {
    setSelectedProject(projectId);
    setShowModelSelection(true);
    setSelectedModel(null);
    setMessages([]);
    setSessionId(null);
    
    await fetchModels(projectId);
  };

  const handleModelSelect = (modelId) => {
    setSelectedModel(modelId);
  };

  const handleStartChat = async () => {
    if (!selectedModel) return;
    
    setShowModelSelection(false);
    
    const newSessionId = await createNewSession();
    if (!newSessionId) {
      console.error('Failed to create session for new chat');
      return;
    }
    
    const projectDisplayName = getDisplayName(selectedProject);
    const selectedModelName = getDisplayName(selectedModel);
    
    const confirmationMessage = {
      id: Date.now(),
      text: `Great! You've selected: \n Project: "${projectDisplayName}" \n Model: "${selectedModelName}"\n How can I help you today?`,
      sender: 'bot',
      timestamp: new Date(),
    };
    setMessages([confirmationMessage]);
  };

  const handleNewChat = async () => {
    setMessages([]);
    setSessionId(null);
    setSelectedProject(null);
    setSelectedModel(null);
    setShowModelSelection(false);
    setShowModelSwitching(false);
    setAvailableModelsForSwitching([]);
    setModels([]);
    
    await fetchProjects();
  };

  const toggleChat = async () => {
    if (isOpen) {
      setIsOpen(false);
      setMessages([]);
      setSessionId(null);
      setSelectedProject(null);
      setSelectedModel(null);
      setShowModelSelection(false);
      setShowModelSwitching(false);
      setAvailableModelsForSwitching([]);
      setModels([]);
      setInputValue('');
    } else {
      setIsOpen(true);
      await fetchProjects();
    }
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  // Updated getDisplayName function with formatting
  const getDisplayName = (id) => {
    if (!id) return id;
    
    let name = id;
    // Remove prefixes if they exist
    if (id.startsWith('engine-')) {
      name = id.replace(/^engine-/, '');
    } else if (id.startsWith('datastore-')) {
      name = id.replace(/^datastore-/, '');
    }
    
    // Check if the name matches the pattern: something-YYYY-MM-DD-HH-MM-SS
    const datePattern = /^(.+)-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/;
    const match = name.match(datePattern);
    
    if (match) {
      const [, baseName, year, month, day, hour, minute, second] = match;
      const formattedDate = `${year}${month}${day}_${hour}${minute}${second}`;
      return `${baseName}-${formattedDate}`;
    }
    
    return name;
  };

  const formatMessageText = (text) => {
    if (!text) return '';

    const lines = text.split('\n');
    const formattedElements = [];
    let currentParagraph = [];
    let inList = false;
    let listItems = [];

    const finalizeParagraph = () => {
      if (currentParagraph.length > 0) {
        // Join with '\n' to preserve line breaks within paragraphs
        formattedElements.push({
          type: 'paragraph',
          content: currentParagraph.join('\n').trim()
        });
        currentParagraph = [];
      }
    };

    const finalizeList = () => {
      if (listItems.length > 0) {
        formattedElements.push({
          type: 'list',
          items: listItems
        });
        listItems = [];
        inList = false;
      }
    };

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      
      if (trimmedLine === '') {
        if (inList) {
          finalizeList();
        } else {
          finalizeParagraph();
        }
        return;
      }

      const bulletPatterns = [
        /^[-*•·‣▪▫‒–—]\s+(.+)$/,
        /^\d+\.\s+(.+)$/,
        /^[a-zA-Z]\.\s+(.+)$/,
        /^[ivxlc]+\.\s+(.+)$/i
      ];

      let isBulletPoint = false;
      let bulletContent = '';

      for (const pattern of bulletPatterns) {
        const match = trimmedLine.match(pattern);
        if (match) {
          isBulletPoint = true;
          bulletContent = match[1] || match[0];
          break;
        }
      }

      if (isBulletPoint) {
        if (!inList) {
          finalizeParagraph();
          inList = true;
        }
        listItems.push(bulletContent);
      } else {
        if (inList) {
          finalizeList();
        }
        
        const nextLine = lines[index + 1]?.trim();
        if (trimmedLine.length < 50 && 
            trimmedLine === trimmedLine.toUpperCase() && 
            nextLine && nextLine !== '') {
          finalizeParagraph();
          formattedElements.push({
            type: 'heading',
            content: trimmedLine
          });
        } else {
          currentParagraph.push(trimmedLine);
        }
      }
    });

    if (inList) {
      finalizeList();
    } else {
      finalizeParagraph();
    }

    return formattedElements;
  };
  
const FormattedMessage = ({ text }) => {
  const elements = formatMessageText(text);
  
  // Helper function to parse markdown-style bold text - FIXED VERSION
  const parseMarkdownBold = (content) => {
      if (!content || typeof content !== 'string') return content;
      
      const parts = content.split(/(\*\*[^*]+\*\*)/g);
      return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const boldText = part.slice(2, -2);
          return <strong key={index}>{boldText}</strong>;
        }
        // Return the part as-is, no additional line break processing here
        return part;
      });
    };
  
  return (
    <div>
      {elements.map((element, index) => {
        switch (element.type) {
          case 'heading':
            return (
              <h4 
                key={index} 
                style={{ 
                  margin: '16px 0 8px 0', 
                  fontSize: '14px', 
                  fontWeight: '600',
                  color: 'inherit',
                  letterSpacing: '0.025em'
                }}
              >
                {parseMarkdownBold(element.content)}
              </h4>
            );
          
          case 'paragraph':
            return (
              <p 
                key={index} 
                style={{ 
                  margin: '8px 0', 
                  lineHeight: '1.5',
                  fontSize: '14px'
                  // Remove whiteSpace: 'pre-line' since we're handling line breaks manually
                }}
              >
                {parseMarkdownBold(element.content)}
              </p>
            );
          
          case 'list':
            return (
              <ul 
                key={index} 
                style={{ 
                  margin: '8px 0', 
                  paddingLeft: '20px',
                  fontSize: '14px',
                  lineHeight: '1.4'
                }}
              >
                {element.items.map((item, itemIndex) => (
                  <li 
                    key={itemIndex} 
                    style={{ 
                      marginBottom: '4px',
                      listStyleType: 'disc'
                    }}
                  >
                    {parseMarkdownBold(item)}
                  </li>
                ))}
              </ul>
            );
          
          default:
            return null;
        }
      })}
    </div>
  );
};

  // Model Switching Component (reuses the selection logic)
  const ModelSwitchingInterface = ({ availableModels }) => (
    <div style={{
      backgroundColor: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      padding: '16px',
      margin: '8px 0'
    }}>
      <div style={{ marginBottom: '12px' }}>
        <h4 style={{ margin: '0 0 4px 0', color: '#1e293b', fontSize: '14px' }}>
          🔄 Switch Model
        </h4>
        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
          Current: {getDisplayName(selectedModel)}
        </p>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
        {availableModels.map((model) => (
          <button
            key={model}
            onClick={() => handleModelSwitch(model)}
            disabled={model === selectedModel}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 12px',
              backgroundColor: model === selectedModel ? '#e2e8f0' : '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              cursor: model === selectedModel ? 'default' : 'pointer',
              fontSize: '13px',
              color: model === selectedModel ? '#64748b' : '#1e293b',
              textAlign: 'left',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              if (model !== selectedModel) {
                e.target.style.backgroundColor = '#f1f5f9';
                e.target.style.borderColor = '#2563eb';
              }
            }}
            onMouseOut={(e) => {
              if (model !== selectedModel) {
                e.target.style.backgroundColor = '#ffffff';
                e.target.style.borderColor = '#e2e8f0';
              }
            }}
          >
            <span style={{ marginRight: '8px' }}>
              {model === selectedModel ? '✓' : '🤖'}
            </span>
            {getDisplayName(model)}
            {model === selectedModel && (
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#64748b' }}>
                (Current)
              </span>
            )}
          </button>
        ))}
      </div>
      
      <button
        onClick={cancelModelSwitching}
        style={{
          width: '100%',
          padding: '8px 12px',
          backgroundColor: '#64748b',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '12px'
        }}
        onMouseOver={(e) => e.target.style.backgroundColor = '#475569'}
        onMouseOut={(e) => e.target.style.backgroundColor = '#64748b'}
      >
        Cancel - Keep Current Model
      </button>
    </div>
  );

  // Size Control Component
  const SizeControls = () => (
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <button
        onClick={toggleSize}
        style={{
          padding: "4px 6px",
          backgroundColor: chatSize === "fullscreen" ? "#1d4ed8" : "transparent",
          border: "none",
          color: "white",
          cursor: "pointer",
          borderRadius: "4px",
          fontSize: "12px",
          opacity: 1,
        }}
        title={chatSize === "fullscreen" ? "Exit Fullscreen" : "Go Fullscreen"}
      >
        {chatSize === "fullscreen" ? "🗗" : "⛶"}
      </button>
    </div>
  );

  const currentSize = getCurrentSize();

  return (
    <div>
      {isOpen && (
        <div
          ref={resizeRef}
          style={{
            position: 'fixed',
            bottom: '80px',
            right: '24px',
            width: typeof currentSize.width === 'string' ? currentSize.width : `${currentSize.width}px`,
            height: typeof currentSize.height === 'string' ? currentSize.height : `${currentSize.height}px`,
            maxWidth: currentSize.maxWidth || 'none',
            maxHeight: currentSize.maxHeight || 'none',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #e5e7eb',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 9999,
            resize: chatSize === 'custom' ? 'both' : 'none',
            overflow: 'hidden'
          }}
        >
          {/* Resize handle for custom resizing */}
          <div
            style={{
              position: 'absolute',
              bottom: '0',
              right: '0',
              width: '20px',
              height: '20px',
              cursor: 'nw-resize',
              zIndex: 10001,
              background: 'linear-gradient(-45deg, transparent 30%, #cbd5e1 30%, #cbd5e1 40%, transparent 40%, transparent 60%, #cbd5e1 60%, #cbd5e1 70%, transparent 70%)'
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizing(true);
            }}
          />

          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px',
              borderBottom: '1px solid #e5e7eb',
              backgroundColor: '#2563eb',
              color: 'white',
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>💬</span>
              <h3 style={{ margin: 0, fontWeight: '600', fontSize: '14px' }}>
                {selectedProject ? getDisplayName(selectedProject) : 'Assistant'}
              </h3>
              {sessionId && (
                <span
                  style={{
                    fontSize: '10px',
                    backgroundColor: '#1d4ed8',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}
                >
                  Active ({sessionId.slice(0, 8)}...)
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SizeControls />
              <button
                onClick={handleNewChat}
                style={{
                  padding: '4px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  fontSize: '16px'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#1d4ed8'}
                onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                title="New Chat"
              >
                🔄
              </button>
              <button
                onClick={toggleChat}
                style={{
                  padding: '4px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  fontSize: '18px'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#1d4ed8'}
                onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                ×
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            {!selectedProject ? (
              // Project Selection Interface
              <div>
                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 8px 0', color: '#374151' }}>
                    Select a Project
                  </h4>
                  <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
                    Choose a project to start:
                  </p>
                </div>
                
                {isLoadingProjects ? (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    padding: '20px'
                  }}>
                    <span style={{ fontSize: '14px', color: '#6b7280' }}>
                      ⏳ Loading projects...
                    </span>
                  </div>
                ) : projects.length === 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '20px',
                    color: '#6b7280'
                  }}>
                    <p>No projects found</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {projects.map((project) => (
                      <button
                        key={project}
                        onClick={() => handleProjectSelect(project)}
                        style={{
                          padding: '12px 16px',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontSize: '14px',
                          color: '#374151',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => {
                          e.target.style.backgroundColor = '#f3f4f6';
                          e.target.style.borderColor = '#2563eb';
                        }}
                        onMouseOut={(e) => {
                          e.target.style.backgroundColor = '#f9fafb';
                          e.target.style.borderColor = '#e5e7eb';
                        }}
                      >
                        📂 {getDisplayName(project)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : showModelSelection ? (
              // Initial Model Selection Interface
              <div>
                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 8px 0', color: '#374151' }}>
                    Select Model
                  </h4>
                </div>
                
                {isLoadingModels ? (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    padding: '20px'
                  }}>
                    <span style={{ fontSize: '14px', color: '#6b7280' }}>
                      ⏳ Loading models...
                    </span>
                  </div>
                ) : models.length === 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '20px',
                    color: '#6b7280'
                  }}>
                    <p>No models found for this project</p>
                    <button
                      onClick={() => setSelectedProject(null)}
                      style={{
                        marginTop: '8px',
                        padding: '8px 16px',
                        backgroundColor: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      ← Back to Projects
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                      {models.map((model) => (
                        <label
                          key={model}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '12px 16px',
                            backgroundColor: selectedModel === model ? '#eff6ff' : '#f9fafb',
                            border: `1px solid ${selectedModel === model ? '#2563eb' : '#e5e7eb'}`,
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            color: '#374151',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseOver={(e) => {
                            if (selectedModel !== model) {
                              e.target.style.backgroundColor = '#f3f4f6';
                            }
                          }}
                          onMouseOut={(e) => {
                            if (selectedModel !== model) {
                              e.target.style.backgroundColor = '#f9fafb';
                            }
                          }}
                        >
                          <input
                            type="radio"
                            name="model-selection"
                            checked={selectedModel === model}
                            onChange={() => handleModelSelect(model)}
                            style={{
                              marginRight: '12px',
                              width: '16px',
                              height: '16px'
                            }}
                          />
                          🤖 {getDisplayName(model)}
                        </label>
                      ))}
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setSelectedProject(null)}
                        style={{
                          flex: 1,
                          padding: '12px',
                          backgroundColor: '#6b7280',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                        onMouseOver={(e) => e.target.style.backgroundColor = '#4b5563'}
                        onMouseOut={(e) => e.target.style.backgroundColor = '#6b7280'}
                      >
                        ← Back
                      </button>
                      <button
                        onClick={handleStartChat}
                        disabled={!selectedModel}
                        style={{
                          flex: 2,
                          padding: '12px',
                          backgroundColor: !selectedModel ? '#9ca3af' : '#2563eb',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: !selectedModel ? 'not-allowed' : 'pointer',
                          fontSize: '14px'
                        }}
                        onMouseOver={(e) => {
                          if (selectedModel) {
                            e.target.style.backgroundColor = '#1d4ed8';
                          }
                        }}
                        onMouseOut={(e) => {
                          if (selectedModel) {
                            e.target.style.backgroundColor = '#2563eb';
                          }
                        }}
                      >
                        Start Chat
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Regular chat messages
              <>
                {messages.map((message) => (
                  <div key={message.id}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: message.sender === 'user' ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '80%',
                          padding: '12px 16px',
                          borderRadius: '8px',
                          backgroundColor: message.sender === 'user' 
                            ? '#2563eb' 
                            : message.isError 
                            ? '#fef2f2' 
                            : '#f3f4f6',
                          color: message.sender === 'user' 
                            ? 'white' 
                            : message.isError 
                            ? '#b91c1c' 
                            : '#374151',
                          border: message.isError ? '1px solid #fecaca' : 'none'
                        }}
                      >
                        <p style={{ margin: 0, fontSize: '14px', whiteSpace: 'pre-wrap' }}>
                          <FormattedMessage text={message.text} />
                        </p>
                        <p
                          style={{
                            margin: '4px 0 0 0',
                            fontSize: '12px',
                            opacity: 0.7
                          }}
                        >
                          {formatTime(message.timestamp)}
                        </p>
                      </div>
                    </div>
                    
                    {/* Render model switching interface if this message has model switching data */}
                    {message.showModelSwitching && message.availableModels && (
                      <ModelSwitchingInterface availableModels={message.availableModels} />
                    )}
                  </div>
                ))}
                
                {isLoading && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div
                      style={{
                        backgroundColor: '#f3f4f6',
                        color: '#374151',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <span style={{ fontSize: '14px' }}>⏳ Thinking...</span>
                    </div>
                  </div>
                )}
              </>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input - Only show when project and model are selected */}
          {selectedProject && selectedModel && !showModelSelection && (
            <div style={{ padding: '16px', borderTop: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="Type your message..."
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    outline: 'none',
                    fontSize: '14px'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                  onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                  disabled={isLoading}
                  maxLength={10000}
                />
                <button
                  onClick={handleSubmit}
                  disabled={!inputValue.trim() || isLoading}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: (!inputValue.trim() || isLoading) ? '#9ca3af' : '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: (!inputValue.trim() || isLoading) ? 'not-allowed' : 'pointer',
                    fontSize: '14px'
                  }}
                  onMouseOver={(e) => {
                    if (!(!inputValue.trim() || isLoading)) {
                      e.target.style.backgroundColor = '#1d4ed8';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!(!inputValue.trim() || isLoading)) {
                      e.target.style.backgroundColor = '#2563eb';
                    }
                  }}
                >
                  ➤
                </button>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '4px'
                }}
              >
                <span style={{ fontSize: '12px', color: '#6b7280' }}>
                  {inputValue.length}/10000
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#6b7280' }}>
                    Size: {chatSize === 'custom' ? 'Custom' : chatSize.charAt(0).toUpperCase() + chatSize.slice(1)}
                  </span>
                  <span style={{ fontSize: '11px', color: '#6b7280' }}>
                    1 model
                  </span>
                  {sessionId && (
                    <span style={{ fontSize: '12px', color: '#059669' }}>
                      Connected
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chat Toggle Button */}
      <button
        onClick={toggleChat}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: isOpen ? '#4b5563' : '#2563eb',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          zIndex: 9998,
          transition: 'all 0.3s ease'
        }}
        onMouseOver={(e) => {
          e.target.style.backgroundColor = isOpen ? '#374151' : '#1d4ed8';
          e.target.style.transform = 'scale(1.1)';
        }}
        onMouseOut={(e) => {
          e.target.style.backgroundColor = isOpen ? '#4b5563' : '#2563eb';
          e.target.style.transform = 'scale(1)';
        }}
      >
        {isOpen ? '×' : '💬'}
      </button>
    </div>
  );
};

export default ChatBot;