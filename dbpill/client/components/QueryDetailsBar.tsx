import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { queryApi } from '../utils/HttpApi';
import {
  QueryDetailsBottomBar,
  QueryDetailsBottomBarSection,
  QueryDetailsTabButton,
  QueryDetailsPanel,
  ActionButton,
  LoadingIndicator,
  StatsTable,
  StatsTableBody,
  StatsTableRow,
  StatsTableLabelCell,
  StatsTableValueCell,
  StatsTableActionCell,
  StatsTableHeaderCell,
  ExpandArrow,
} from '../styles/Styled';
import { formatNumber } from '../utils/formatNumber';

interface QueryDetailsBarProps {
  queryId: string;
  hasLlmResponse: boolean;
  setStats: (fn: (prevStats: any[]) => any[]) => void;
  stat: any;
}

export function QueryDetailsBar({ 
  queryId, 
  hasLlmResponse, 
  setStats, 
  stat 
}: QueryDetailsBarProps) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [queryDetails, setQueryDetails] = useState<any>(null);
  const [relevantTables, setRelevantTables] = useState<any>(null);
  const [runningInstances, setRunningInstances] = useState<{ [key: string]: boolean }>({});
  const [instanceType, setInstanceType] = useState<'slowest' | 'fastest' | 'latest'>('latest');

  // Prompt editing state
  const [isEditingPrompt, setIsEditingPrompt] = useState<boolean>(false);
  const [editedPrompt, setEditedPrompt] = useState<string>('');
  const [hasEditedPrompt, setHasEditedPrompt] = useState<boolean>(false);

  // Copy prompt UI feedback
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);

  // Reset edited state when queryId changes
  useEffect(() => {
    setHasEditedPrompt(false);
    setIsEditingPrompt(false);
  }, [queryId]);

  // Whenever queryDetails change, reset editedPrompt
  useEffect(() => {
    if (queryDetails?.prompt_preview && !isEditingPrompt && !hasEditedPrompt) {
      setEditedPrompt(queryDetails.prompt_preview);
    }
  }, [queryDetails, isEditingPrompt, hasEditedPrompt]);

  const fetchQueryDetails = async (forceRefresh = false) => {
    if (queryDetails && !forceRefresh) return; // already fetched
    try {
      const data = await queryApi.getQuery(queryId, instanceType);
      // Preserve edited prompt if it exists
      if (hasEditedPrompt && editedPrompt) {
        data.prompt_preview = editedPrompt;
      }
      setQueryDetails(data);
    } catch (error) {
      console.error('Error fetching query details:', error);
    }
  };

  const fetchTablesInfo = async (forceRefresh = false) => {
    if (relevantTables && !forceRefresh) return;
    try {
      const data = await queryApi.getRelevantTables(queryId);
      setRelevantTables(data);
    } catch (error) {
      console.error('Error fetching tables info:', error);
    }
  };

  const handleTabClick = (tabId: string) => {
    const isClosing = activeTab === tabId;
    setActiveTab(isClosing ? null : tabId);
    
    if (isClosing) {
      // Clear cached data when closing tabs, but preserve AI-related data if prompt was edited
      if (!hasEditedPrompt || (!tabId.startsWith('ai'))) {
        setQueryDetails(null);
      }
      setRelevantTables(null);
    } else {
      // Force refresh when opening tabs, but not for AI tabs if prompt was edited
      if (tabId.startsWith('query') || tabId.startsWith('stats')) {
        fetchQueryDetails(true); // Force refresh
      } else if (tabId.startsWith('ai')) {
        if (!hasEditedPrompt) {
          fetchQueryDetails(true); // Only force refresh if no edits
        } else {
          fetchQueryDetails(false); // Use cached data if we have edits
        }
      }
             if (tabId === 'query-tables') {
         fetchTablesInfo(true); // Force refresh
       }
    }
  };

  const handleInstanceRerun = async (instanceId: number, params: string) => {
    const key = `${queryId}-${instanceId}`;
    setRunningInstances(prev => ({ ...prev, [key]: true }));
    
    try {
      const data = await queryApi.analyzeQueryWithParams(queryId, params);
      
      setStats(prevStats => {
        const newStats = [...prevStats];
        const idx = newStats.findIndex(s => s.query_id === parseInt(queryId));
        if (idx !== -1) newStats[idx] = { ...newStats[idx], ...data };
        return newStats;
      });
      
      // Refresh query details to show the new instance
      await fetchQueryDetails(true);
    } catch (error) {
      console.error('Error running query instance:', error);
    } finally {
      setRunningInstances(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleInstanceTypeChange = (newType: 'slowest' | 'fastest' | 'latest') => {
    setInstanceType(newType);
  };

  // Add a helper to copy the current prompt/text to clipboard
  const handleCopyPrompt = () => {
    const promptText = isEditingPrompt ? editedPrompt : (queryDetails?.prompt_preview ?? '');
    if (promptText) {
      navigator.clipboard.writeText(promptText).then(() => {
        setCopiedPrompt(true);
        setTimeout(() => setCopiedPrompt(false), 2000);
      }).catch(err => {
        console.error('Failed to copy prompt:', err);
      });
    }
  };

  // Refetch query details whenever the instanceType changes and the Query Plan tab is active
  useEffect(() => {
    if (activeTab === 'query-plan') {
      fetchQueryDetails(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceType]);

  return (
    <>
      <QueryDetailsBottomBar>
        {/* Query section */}
        <QueryDetailsBottomBarSection>
          <QueryDetailsTabButton
            $active={activeTab === 'query-plan'}
            onClick={() => handleTabClick('query-plan')}
          >
            <ExpandArrow>{activeTab === 'query-plan' ? '-' : '+'}</ExpandArrow> Query plan
          </QueryDetailsTabButton>
          <QueryDetailsTabButton
            $active={activeTab === 'query-tables'}
            onClick={() => handleTabClick('query-tables')}
          >
            <ExpandArrow>{activeTab === 'query-tables' ? '-' : '+'}</ExpandArrow> Tables
          </QueryDetailsTabButton>
        </QueryDetailsBottomBarSection>

        {/* Stats section - removed Run again button */}
        <QueryDetailsBottomBarSection>
          <QueryDetailsTabButton
            $active={activeTab === 'stats-runs'}
            onClick={() => handleTabClick('stats-runs')}
          >
            <ExpandArrow>{activeTab === 'stats-runs' ? '-' : '+'}</ExpandArrow> Individual runs
          </QueryDetailsTabButton>
        </QueryDetailsBottomBarSection>

        {/* AI section */}
        <QueryDetailsBottomBarSection>
          <QueryDetailsTabButton
            $active={activeTab === 'ai-prompt'}
            onClick={() => handleTabClick('ai-prompt')}
          >
            <ExpandArrow>{activeTab === 'ai-prompt' ? '-' : '+'}</ExpandArrow> Prompt
          </QueryDetailsTabButton>
          <QueryDetailsTabButton
            disabled={!hasLlmResponse}
            $active={activeTab === 'ai-response'}
            onClick={() => handleTabClick('ai-response')}
          >
            <ExpandArrow>{activeTab === 'ai-response' ? '-' : '+'}</ExpandArrow> Full AI response
          </QueryDetailsTabButton>
        </QueryDetailsBottomBarSection>
      </QueryDetailsBottomBar>

      {activeTab && (
        <QueryDetailsPanel>
          {activeTab === 'query-plan' && (
            <div>
              <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold' }}>Instance type:</span>
                <select 
                  value={instanceType} 
                  onChange={(e) => handleInstanceTypeChange(e.target.value as 'slowest' | 'fastest' | 'latest')}
                  style={{ 
                    padding: '4px 8px', 
                    borderRadius: '4px', 
                    border: '1px solid #333',
                    backgroundColor: '#1a1a1a',
                    color: 'white'
                  }}
                >
                  <option value="latest">Latest</option>
                  <option value="slowest">Slowest</option>
                  <option value="fastest">Fastest</option>
                </select>
              </div>
              <pre>{queryDetails?.selected_instance?.query_plan ?? 'Loading...'}</pre>
            </div>
          )}

          {activeTab === 'query-tables' && (
            relevantTables ? (
              Object.entries(relevantTables).map(([table, info]: any) => (
                <div key={table} style={{ marginBottom: '1rem' }}>
                  <h2>{table}: {formatNumber(info.table_size_bytes)} bytes, est. {formatNumber(info.estimated_rows)} rows</h2>
                  {info.table_definition && (
                    <pre style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem' }}>{info.table_definition}</pre>
                  )}
                </div>
              ))
            ) : (
              'Loading...'
            )
          )}

          {activeTab === 'stats-runs' && (
            queryDetails?.instances ? (
              (() => {
                // Parse parameters from all instances to determine the maximum number of parameters
                const allParams = queryDetails.instances.map((inst: any) => {
                  try {
                    return JSON.parse(inst.params);
                  } catch {
                    return [];
                  }
                });
                const maxParams = Math.max(...allParams.map((params: any[]) => params.length), 0);
                
                return (
                  <StatsTable style={{ width: '100%' }}>
                    <StatsTableBody>
                      <StatsTableRow>
                        {Array.from({ length: maxParams }, (_, i) => (
                          <StatsTableHeaderCell key={i}>Param ${i + 1}</StatsTableHeaderCell>
                        ))}
                        <StatsTableHeaderCell>Exec Time</StatsTableHeaderCell>
                        <StatsTableHeaderCell>Plan Time</StatsTableHeaderCell>
                        <StatsTableHeaderCell>Action</StatsTableHeaderCell>
                      </StatsTableRow>
                      {queryDetails.instances.map((inst: any, i: number) => {
                        const instanceKey = `${queryId}-${inst.instance_id}`;
                        let parsedParams: any[] = [];
                        try {
                          parsedParams = JSON.parse(inst.params);
                        } catch {
                          parsedParams = [];
                        }
                        
                        return (
                          <StatsTableRow key={inst.instance_id}>
                            {Array.from({ length: maxParams }, (_, paramIndex) => (
                              <StatsTableLabelCell key={paramIndex} style={{ 
                                maxWidth: '150px', 
                                whiteSpace: 'nowrap', 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis' 
                              }}>
                                {parsedParams[paramIndex] || ''}
                              </StatsTableLabelCell>
                            ))}
                            <StatsTableValueCell>{formatNumber(inst.exec_time)} ms</StatsTableValueCell>
                            <StatsTableValueCell>{formatNumber(inst.plan_time)} ms</StatsTableValueCell>
                            <StatsTableActionCell>
                              <ActionButton
                                $variant="secondary"
                                onClick={() => handleInstanceRerun(inst.instance_id, inst.params)}
                                disabled={runningInstances[instanceKey]}
                                style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: '4px 8px', minWidth: '60px' }}
                              >
                                {runningInstances[instanceKey] ? (
                                  <LoadingIndicator>Running...</LoadingIndicator>
                                ) : (
                                  '↻ Run again'
                                )}
                              </ActionButton>
                            </StatsTableActionCell>
                          </StatsTableRow>
                        );
                      })}
                    </StatsTableBody>
                  </StatsTable>
                );
              })()
            ) : (
              'Loading...'
            )
          )}

          {activeTab === 'ai-prompt' && (
            <div style={{ position: 'relative', width: '100%' }}>
              {/* Toggle edit button */}
              <h2>
                Prompt for AI suggestions
                {hasEditedPrompt && <span style={{ color: '#ff9500', fontSize: '0.8em', marginLeft: '8px' }}>(edited)</span>}
              </h2>
              <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex', gap: '8px' }}>
                {hasEditedPrompt && (
                  <ActionButton
                    $variant="secondary"
                    style={{ padding: '4px 8px' }}
                    onClick={async () => {
                      setHasEditedPrompt(false);
                      // Fetch fresh data from server to get original prompt
                      try {
                        const originalData = await queryApi.getQuery(queryId, instanceType);
                        setEditedPrompt(originalData.prompt_preview || '');
                        setQueryDetails(originalData);
                        // Reset in parent stats too
                        setStats(prevStats => {
                          const newStats = [...prevStats];
                          const idx = newStats.findIndex(s => s.query_id === parseInt(queryId));
                          if (idx !== -1) newStats[idx] = { ...newStats[idx], prompt_preview: originalData.prompt_preview || '' };
                          return newStats;
                        });
                      } catch (error) {
                        console.error('Error fetching original prompt:', error);
                        // Fallback to cached data
                        setEditedPrompt(queryDetails?.prompt_preview || '');
                      }
                    }}
                  >
                    ↩ Reset to original
                  </ActionButton>
                )}
                <ActionButton
                  $variant="secondary"
                  style={{ padding: '4px 8px' }}
                  onClick={handleCopyPrompt}
                >
                  {copiedPrompt ? 'Copied!' : '📋 Copy prompt'}
                </ActionButton>
                <ActionButton
                  $variant="secondary"
                  style={{ padding: '4px 8px' }}
                  onClick={() => setIsEditingPrompt(prev => !prev)}
                >
                  {isEditingPrompt ? 'Done editing' : '✏️ Edit prompt manually'}
                </ActionButton>
              </div>

              {isEditingPrompt ? (
                <textarea
                  value={editedPrompt}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditedPrompt(val);
                    setHasEditedPrompt(true);
                    // Update parent stats so QueryList knows about the new prompt
                    setStats(prevStats => {
                      const newStats = [...prevStats];
                      const idx = newStats.findIndex(s => s.query_id === parseInt(queryId));
                      if (idx !== -1) newStats[idx] = { ...newStats[idx], prompt_preview: val };
                      return newStats;
                    });
                    // Also update local queryDetails for immediate display
                    setQueryDetails(prev => prev ? { ...prev, prompt_preview: val } : prev);
                  }}
                  style={{
                    width: '100%',
                    minHeight: '300px',
                    backgroundColor: '#1a1a1a',
                    color: 'white',
                    border: '1px solid #333',
                    padding: '8px',
                    borderRadius: '4px',
                    whiteSpace: 'pre-wrap',
                  }}
                />
              ) : (
                <pre style={{ whiteSpace: 'pre-wrap' }}>{queryDetails?.prompt_preview ?? 'No prompt'}</pre>
              )}
            </div>
          )}

          {activeTab === 'ai-response' && (
            queryDetails?.suggestions && Array.isArray(queryDetails.suggestions) && queryDetails.suggestions.length > 0 ? (
              <pre style={{ whiteSpace: 'pre-wrap' }}>
                {queryDetails.suggestions
                  .slice()
                  .reverse() // Convert from DESC order to ascending (oldest first)
                  .map((suggestion: any, idx: number) => 
                    `--- Suggestion #${idx + 1} ---\n${suggestion.llm_response || ''}`
                  )
                  .join('\n\n')}
              </pre>
            ) : queryDetails?.llm_response ? (
              <pre style={{ whiteSpace: 'pre-wrap' }}>{queryDetails.llm_response}</pre>
            ) : (
              'No AI response'
            )
          )}
        </QueryDetailsPanel>
      )}
    </>
  );
} 