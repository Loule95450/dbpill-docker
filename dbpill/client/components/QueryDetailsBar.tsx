import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
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

  const fetchQueryDetails = async (forceRefresh = false) => {
    if (queryDetails && !forceRefresh) return; // already fetched
    const res = await fetch(`/api/query/${queryId}`);
    const data = await res.json();
    setQueryDetails(data);
  };

  const fetchTablesInfo = async () => {
    if (relevantTables) return;
    const res = await fetch(`/api/relevant_tables?query_id=${queryId}`);
    const data = await res.json();
    setRelevantTables(data);
  };

  const handleTabClick = (tabId: string) => {
    setActiveTab(activeTab === tabId ? null : tabId);
    
    // Fetch data based on tab type
    if (tabId.startsWith('query') || tabId.startsWith('stats') || tabId.startsWith('ai')) {
      fetchQueryDetails();
    }
    if (tabId === 'query-tables') {
      fetchTablesInfo();
    }
  };

  const handleInstanceRerun = async (instanceId: number, params: string) => {
    const key = `${queryId}-${instanceId}`;
    setRunningInstances(prev => ({ ...prev, [key]: true }));
    
    try {
      const response = await fetch(`/api/analyze_query_with_params?query_id=${queryId}&params=${encodeURIComponent(params)}`);
      const data = await response.json();
      
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

  return (
    <>
      <QueryDetailsBottomBar>
        {/* Query section */}
        <QueryDetailsBottomBarSection>
          <QueryDetailsTabButton
            $active={activeTab === 'query-plan'}
            onClick={() => handleTabClick('query-plan')}
          >
            Query plan
          </QueryDetailsTabButton>
          <QueryDetailsTabButton
            $active={activeTab === 'query-tables'}
            onClick={() => handleTabClick('query-tables')}
          >
            Tables
          </QueryDetailsTabButton>
        </QueryDetailsBottomBarSection>

        {/* Stats section - removed Run again button */}
        <QueryDetailsBottomBarSection>
          <QueryDetailsTabButton
            $active={activeTab === 'stats-runs'}
            onClick={() => handleTabClick('stats-runs')}
          >
            Individual runs
          </QueryDetailsTabButton>
        </QueryDetailsBottomBarSection>

        {/* AI section */}
        <QueryDetailsBottomBarSection>
          <QueryDetailsTabButton
            disabled={!hasLlmResponse}
            $active={activeTab === 'ai-prompt'}
            onClick={() => handleTabClick('ai-prompt')}
          >
            Prompt
          </QueryDetailsTabButton>
          <QueryDetailsTabButton
            disabled={!hasLlmResponse}
            $active={activeTab === 'ai-response'}
            onClick={() => handleTabClick('ai-response')}
          >
            Full AI response
          </QueryDetailsTabButton>
        </QueryDetailsBottomBarSection>
      </QueryDetailsBottomBar>

      {activeTab && (
        <QueryDetailsPanel>
          {activeTab === 'query-plan' && (
            <pre>{queryDetails?.instances?.[0]?.query_plan ?? 'Loading...'}</pre>
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
                                style={{ fontSize: '10px', padding: '4px 8px', minWidth: '60px' }}
                              >
                                {runningInstances[instanceKey] ? (
                                  <LoadingIndicator>Running...</LoadingIndicator>
                                ) : (
                                  '↻ Run'
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
            <pre style={{ whiteSpace: 'pre-wrap' }}>{queryDetails?.prompt_preview ?? 'No prompt'}</pre>
          )}

          {activeTab === 'ai-response' && (
            queryDetails?.llm_response ? (
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