import { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { queryApi } from '../utils/HttpApi';
import styled from 'styled-components';

import {
  QuerySort,
  QuerySortOption,
  TableContainer,
  QueryCard,
  QueryContentSection,
  QueryText,
  QueryStatsSection,
  PerformanceBadge,
  ActionGroup,
  ActionButton,
  QueryActionsSection,
  StatusTag,
  SuggestionContent,
  HighlightedSQL,
  LoadingIndicator,
  StatsTable,
  StatsTableBody,
  StatsTableRow,
  StatsTableLabelCell,
  StatsTableValueCell,
  StatsTableActionCell,
  StatsTableImprovementCell,
  SuggestionTitleBar,
  SuggestionTitleGroup,
  SuggestionActionGroup,
  SuggestionContainer,
  NumUnit,
} from '../styles/Styled';

import { QueryDetailsBar } from './QueryDetailsBar';

import { formatNumber } from '../utils/formatNumber';
import { highlightSQL } from '../utils/sqlHighlighter';

// --- Local styled components for the new bottom tab bar redesign ---

const CardWrapper = styled.div`
  display: flex;
  flex-direction: column;
`;

const StatsHeader = styled.div`
  margin-bottom: 10px;
  padding-left: 5px;
`;

const StatsText = styled.div`
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
`;

const InstructionsContainer = styled.div`
  max-width: 600px;
  margin: 0 auto;
  line-height: 1.6;
  
  h1 {
    margin-bottom: 20px;
    color: color(display-p3 0.964 0.7613 0.3253);
  }
  
  p {
    margin-bottom: 15px;
    color: rgba(255, 255, 255, 0.9);
  }
`;

export function QueryList() {
  const [stats, setStats] = useState<any[]>([]);
  const [orderBy, setOrderBy] = useState<string>('avg_exec_time');
  const [orderDirection, setOrderDirection] = useState<'asc' | 'desc'>('desc');
  const [loadingSuggestions, setLoadingSuggestions] = useState<{ [key: string]: boolean }>({});
  const [rerunning, setRerunning] = useState<{ [key: string]: boolean }>({});
  const [expandedQueries, setExpandedQueries] = useState<{ [key: string]: boolean }>({});
  const [editingIndexes, setEditingIndexes] = useState<{ [key: string]: boolean }>({});
  const [editedIndexes, setEditedIndexes] = useState<{ [key: string]: string }>({});
  const [hasEditedIndexes, setHasEditedIndexes] = useState<{ [key: string]: boolean }>({});
  const navigate = useNavigate();
  const { args } = useContext(AppContext);

  const toggleQueryExpansion = (queryId: string) => {
    setExpandedQueries(prev => ({
      ...prev,
      [queryId]: !prev[queryId],
    }));
  };

  const startManualIndexEdit = (queryId: string, currentIndexes?: string) => {
    const initialContent = currentIndexes || '';
    setEditedIndexes(prev => ({ ...prev, [queryId]: initialContent }));
    setEditingIndexes(prev => ({ ...prev, [queryId]: true }));
    if (!currentIndexes) {
      // If no current indexes, we're creating a manual suggestion
      // Check if this is a suggestion key (contains hyphen) or a plain query ID
      const actualQueryId = queryId.includes('-') ? queryId.split('-')[0] : queryId;
      setStats(prevStats => {
        const newStats = [...prevStats];
        const index = newStats.findIndex(s => s.query_id === parseInt(actualQueryId));
        if (index !== -1) {
          newStats[index] = {
            ...newStats[index],
            suggested_indexes: '',
            llm_response: 'Manual suggestion', // Minimal response to show we have suggestions
          };
        }
        return newStats;
      });
    }
  };

  const saveEditedIndexes = async (queryId: string) => {
    const editedContent = editedIndexes[queryId] || '';
    // Check if this is a suggestion key (contains hyphen) or a plain query ID
    const actualQueryId = queryId.includes('-') ? queryId.split('-')[0] : queryId;
    setLoadingSuggestions(prev => ({ ...prev, [actualQueryId]: true }));
    
    try {
      // Save edited indexes to backend
      const data = await queryApi.saveEditedIndexes(actualQueryId, editedContent);
      
      setStats(prevStats => {
        const newStats = [...prevStats];
        const index = newStats.findIndex(s => s.query_id === parseInt(actualQueryId));
        if (index !== -1) {
          newStats[index] = {
            ...newStats[index],
            suggested_indexes: editedContent,
            ...data, // Include any additional data from backend
          };
        }
        return newStats;
      });
      
      setHasEditedIndexes(prev => ({ ...prev, [queryId]: true }));
      setEditingIndexes(prev => ({ ...prev, [queryId]: false }));
    } catch (error: any) {
      alert(error.message || 'Error saving edited indexes');
    } finally {
      setLoadingSuggestions(prev => ({ ...prev, [actualQueryId]: false }));
    }
  };

  const order = (column: string) => {
    if (orderBy === column) {
      setOrderDirection(orderDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setOrderDirection('desc');
    }
    setOrderBy(column);
  };

  const handleRerun = async (queryId: string) => {
    setRerunning(prev => ({ ...prev, [queryId]: true }));
    try {
      const data = await queryApi.analyzeQuery(queryId);
      setStats(prevStats => {
        const newStats = [...prevStats];
        const idx = newStats.findIndex(s => s.query_id === parseInt(queryId));
        if (idx !== -1) newStats[idx] = { ...newStats[idx], ...data };
        return newStats;
      });
    } catch (error) {
      console.error('Error rerunning query:', error);
    } finally {
      setRerunning(prev => ({ ...prev, [queryId]: false }));
    }
  };

  const getSuggestions = async (query_id: string) => {
    if (loadingSuggestions[query_id]) {
      return;
    }

    // Find any custom prompt stored in the current stats array for this query
    const currentStat = stats.find((s) => s.query_id === parseInt(query_id));
    const promptOverride = currentStat?.prompt_preview;

    setLoadingSuggestions(prev => ({ ...prev, [query_id]: true }));
    try {
      const data = await queryApi.getSuggestions(query_id, promptOverride);
      setStats((prevStats) => {
        const newStats = [...prevStats];
        const index = newStats.findIndex((stat) => stat.query_id === parseInt(query_id));
        if (index !== -1) {
          newStats[index] = {
            ...newStats[index],
            ...data,
          };
        }
        return newStats;
      });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingSuggestions(prev => ({ ...prev, [query_id]: false }));
    }
  };

  const applySuggestions = async (query_id: string) => {
    if (loadingSuggestions[query_id]) {
      return;
    }
    setLoadingSuggestions(prev => ({ ...prev, [query_id]: true }));
    try {
      const data = await queryApi.applySuggestions(query_id);
      setStats((prevStats) => {
        const newStats = [...prevStats];
        const index = newStats.findIndex((stat) => stat.query_id === parseInt(query_id));
        if (index !== -1) {
          newStats[index] = {
            ...newStats[index],
            ...data,
          };
        }
        return newStats;
      });
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoadingSuggestions(prev => ({ ...prev, [query_id]: false }));
    }
  };

  const revertSuggestions = async (query_id: string) => {
    if (loadingSuggestions[query_id]) {
      return;
    }
    setLoadingSuggestions(prev => ({ ...prev, [query_id]: true }));
    try {
      const data = await queryApi.revertSuggestions(query_id);
      setStats((prevStats) => {
        const newStats = [...prevStats];
        const index = newStats.findIndex((stat) => stat.query_id === parseInt(query_id));
        if (index !== -1) {
          newStats[index] = {
            ...newStats[index],
            ...data,
          };
        }
        return newStats;
      });
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoadingSuggestions(prev => ({ ...prev, [query_id]: false }));
    }
  };

  useEffect(() => {
    const loadQueries = async () => {
      try {
        const data = await queryApi.getAllQueries(orderBy, orderDirection);
        setStats(data.stats);
        setOrderBy(data.orderBy);
        setOrderDirection(data.orderDirection as 'asc' | 'desc');
      } catch (error) {
        console.error('Error loading queries:', error);
      }
    };
    
    loadQueries();
  }, [orderBy, orderDirection]);

  const columns = stats[0] ? Object.keys(stats[0]) : [];
  if (columns.includes('query_id')) {
    columns.splice(columns.indexOf('query_id'), 1);
  }

  // Show instructions if no queries are available
  if (stats.length === 0) {
    return (
      <InstructionsContainer>
        <h1>Instructions</h1>
        {args && (
          <>
            <p>
              dbpill is running on port {args.proxyPort}. Change your app's PostgreSQL
              connection to port {args.proxyPort} to start intercepting queries.
            </p>
            <p>Once you start running queries through dbpill, they will appear here for analysis and optimization.</p>
            <p>You can reset all dbpill-triggered changes from the Config tab.</p>
          </>
        )}
      </InstructionsContainer>
    );
  }

  return (
    <div>
      <StatsHeader>
        <StatsText>
          {stats.length} unique queries captured{' '}
          {stats.reduce((acc, stat) => acc + stat.num_instances, 0)} times
        </StatsText>
      </StatsHeader>
      <QuerySort>

        <QuerySortOption
          onClick={() => order('avg_exec_time')}
          $active={orderBy === 'avg_exec_time' ? 'true' : undefined}
        >
          {orderBy === 'avg_exec_time' && (orderDirection === 'asc' ? '▲' : '▼')} Avg time
        </QuerySortOption>
        <QuerySortOption
          onClick={() => order('total_time')}
          $active={orderBy === 'total_time' ? 'true' : undefined}
        >
          {orderBy === 'total_time' && (orderDirection === 'asc' ? '▲' : '▼')} Total time
        </QuerySortOption>

        <QuerySortOption
          onClick={() => order('max_exec_time')}
          $active={orderBy === 'max_exec_time' ? 'true' : undefined}
        >
          {orderBy === 'max_exec_time' && (orderDirection === 'asc' ? '▲' : '▼')} Max time
        </QuerySortOption>
        <QuerySortOption
          onClick={() => order('num_instances')}
          $active={orderBy === 'num_instances' ? 'true' : undefined}
        >
          {orderBy === 'num_instances' && (orderDirection === 'asc' ? '▲' : '▼')} Run count
        </QuerySortOption>
        <QuerySortOption
          onClick={() => order('prev_exec_time/new_exec_time')}
          $active={orderBy === 'prev_exec_time/new_exec_time' ? 'true' : undefined}
        >
          {orderBy === 'prev_exec_time/new_exec_time' && (orderDirection === 'asc' ? '▲' : '▼')} Improvements
        </QuerySortOption>
      </QuerySort>

      <TableContainer>
        {stats.map((stat, index) => {
          const isExpanded = expandedQueries[stat.query_id];
          const hasPerformanceData = stat.new_exec_time && stat.prev_exec_time;
          const improvement = hasPerformanceData ? stat.prev_exec_time / stat.new_exec_time : 0;

          return (
            <CardWrapper key={stat.query_id}>
              <QueryCard>
                <QueryContentSection>
                  <QueryText $expanded={isExpanded} onClick={() => toggleQueryExpansion(stat.query_id)}>
                    {highlightSQL(stat.query)}
                  </QueryText>
                </QueryContentSection>

                <QueryStatsSection>
                  <StatsTable>
                    <StatsTableBody>
                      <StatsTableRow>
                        <StatsTableLabelCell>Total</StatsTableLabelCell>
                        <StatsTableValueCell colSpan={2}>
                          {formatNumber(stat.total_time)} <NumUnit>ms</NumUnit> <NumUnit>from</NumUnit> {stat.num_instances} <NumUnit>{stat.num_instances === 1 ? 'run' : 'runs'}</NumUnit>
                        </StatsTableValueCell>
                      </StatsTableRow>
                      <StatsTableRow>
                        <StatsTableLabelCell>Avg</StatsTableLabelCell>
                        <StatsTableValueCell colSpan={2}>{formatNumber(stat.avg_exec_time)} <NumUnit>ms</NumUnit></StatsTableValueCell>
                      </StatsTableRow>
                      <StatsTableRow>
                        <StatsTableLabelCell>Min</StatsTableLabelCell>
                        <StatsTableValueCell colSpan={2}>{formatNumber(stat.min_exec_time)} <NumUnit>ms</NumUnit></StatsTableValueCell>
                      </StatsTableRow>
                      <StatsTableRow>
                        <StatsTableLabelCell>Max</StatsTableLabelCell>
                        <StatsTableValueCell colSpan={2}>{formatNumber(stat.max_exec_time)} <NumUnit>ms</NumUnit></StatsTableValueCell>
                      </StatsTableRow>
                      <StatsTableRow>
                        <StatsTableLabelCell>Last</StatsTableLabelCell>
                        <StatsTableValueCell colSpan={2}>{formatNumber(stat.last_exec_time)} <NumUnit>ms</NumUnit></StatsTableValueCell>
                      </StatsTableRow>
                    </StatsTableBody>
                  </StatsTable>

                  <ActionButton
                    $variant="secondary"
                    onClick={() => handleRerun(stat.query_id.toString())}
                    disabled={rerunning[stat.query_id]}
                    style={{ marginTop: '8px', alignSelf: 'flex-start' }}
                  >
                    {rerunning[stat.query_id] ? <LoadingIndicator>Running...</LoadingIndicator> : (
                      <>
                        ↻ Run again <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>with random params</span>
                      </>
                    )}
                  </ActionButton>
                </QueryStatsSection>

                <QueryActionsSection>
                  {!stat.llm_response ? (
                    <>
                      <ActionButton
                        $variant="ai-suggestion"
                        onClick={() => getSuggestions(stat.query_id)}
                        disabled={loadingSuggestions[stat.query_id]}
                      >
                        {loadingSuggestions[stat.query_id] ? (
                          <LoadingIndicator>Getting suggestions...</LoadingIndicator>
                        ) : (
                          '🤖 Get AI Suggestions'
                        )}
                      </ActionButton>
                      <ActionButton
                        $variant="secondary"
                        onClick={() => startManualIndexEdit(stat.query_id.toString())}
                        style={{ marginLeft: '8px' }}
                      >
                        ✏️ Manual suggestion
                      </ActionButton>
                    </>
                  ) : (
                    <>
                      {/* Render list of suggestions if available */}
                      {stat.suggestions && Array.isArray(stat.suggestions) && stat.suggestions.length > 0 ? (
                        stat.suggestions.map((s: any, idx: number) => {
                          // Determine status based on applied and reverted flags
                          const isReverted = !!s.reverted;
                          const isApplied = !!s.applied && !isReverted;
                          const isSuggested = !s.applied && !isReverted;
                          
                          const status = isReverted ? 'reverted' : isApplied ? 'applied' : 'suggested';
                          const statusText = isReverted ? 'Reverted' : isApplied ? 'Applied' : 'Suggested';
                          
                          const hasPerf = s.prev_exec_time !== null && s.new_exec_time !== null && s.prev_exec_time !== undefined && s.new_exec_time !== undefined;
                          const improvementVal = hasPerf ? (s.prev_exec_time / s.new_exec_time) : 0;
                          const suggestionKey = `${stat.query_id}-${idx}`;
                          return (
                            <SuggestionContainer key={idx}>
                              <SuggestionTitleBar $status={status}>
                                <SuggestionTitleGroup>
                                  <StatusTag $status={status}>
                                    {statusText}
                                  </StatusTag>
                                  {hasEditedIndexes[suggestionKey] && (
                                    <span style={{ color: '#ff9500', fontSize: '0.8em', marginLeft: '8px' }}>(edited)</span>
                                  )}
                                </SuggestionTitleGroup>

                                <SuggestionActionGroup>
                                  {isSuggested && !editingIndexes[suggestionKey] && (
                                    <>
                                      <ActionButton
                                        $variant="secondary"
                                        onClick={() => startManualIndexEdit(suggestionKey, s.suggested_indexes)}
                                        style={{ padding: '4px 8px' }}
                                      >
                                        ✏️ Edit
                                      </ActionButton>
                                      <ActionButton
                                        $variant="success"
                                        onClick={() => applySuggestions(stat.query_id)}
                                        disabled={loadingSuggestions[stat.query_id]}
                                      >
                                        {loadingSuggestions[stat.query_id] ? (
                                          <LoadingIndicator>Applying...</LoadingIndicator>
                                        ) : (
                                          `⬇ Apply Index${s.suggested_indexes && s.suggested_indexes.trim().split(';').filter(line => line.trim()).length > 1 ? 'es' : ''}`
                                        )}
                                      </ActionButton>
                                    </>
                                  )}

                                  {isSuggested && editingIndexes[suggestionKey] && (
                                    <ActionButton
                                      $variant="success"
                                      onClick={() => saveEditedIndexes(suggestionKey)}
                                      disabled={loadingSuggestions[stat.query_id]}
                                      style={{ padding: '4px 8px' }}
                                    >
                                      {loadingSuggestions[stat.query_id] ? (
                                        <LoadingIndicator>Saving...</LoadingIndicator>
                                      ) : (
                                        '💾 Save'
                                      )}
                                    </ActionButton>
                                  )}

                                  {isApplied && (
                                    <ActionButton
                                      $variant="danger"
                                      onClick={() => revertSuggestions(stat.query_id)}
                                      disabled={loadingSuggestions[stat.query_id]}
                                    >
                                      {loadingSuggestions[stat.query_id] ? (
                                        <LoadingIndicator>Reverting...</LoadingIndicator>
                                      ) : (
                                        '⬆ Revert'
                                      )}
                                    </ActionButton>
                                  )}

                                  {isReverted && !editingIndexes[suggestionKey] && (
                                    <>
                                      <ActionButton
                                        $variant="secondary"
                                        onClick={() => startManualIndexEdit(suggestionKey, s.suggested_indexes)}
                                        style={{ padding: '4px 8px' }}
                                      >
                                        ✏️ Edit
                                      </ActionButton>
                                      <ActionButton
                                        $variant="success"
                                        onClick={() => applySuggestions(stat.query_id)}
                                        disabled={loadingSuggestions[stat.query_id]}
                                      >
                                        {loadingSuggestions[stat.query_id] ? (
                                          <LoadingIndicator>Re-applying...</LoadingIndicator>
                                        ) : (
                                          `⬇ Re-apply${s.suggested_indexes && s.suggested_indexes.trim().split(';').filter(line => line.trim()).length > 1 ? 'es' : ''}`
                                        )}
                                      </ActionButton>
                                    </>
                                  )}

                                  {isReverted && editingIndexes[suggestionKey] && (
                                    <ActionButton
                                      $variant="success"
                                      onClick={() => saveEditedIndexes(suggestionKey)}
                                      disabled={loadingSuggestions[stat.query_id]}
                                      style={{ padding: '4px 8px' }}
                                    >
                                      {loadingSuggestions[stat.query_id] ? (
                                        <LoadingIndicator>Saving...</LoadingIndicator>
                                      ) : (
                                        '💾 Save'
                                      )}
                                    </ActionButton>
                                  )}
                                </SuggestionActionGroup>
                              </SuggestionTitleBar>

                              <SuggestionContent $status={status}>
                                {editingIndexes[suggestionKey] ? (
                                  <textarea
                                    value={editedIndexes[suggestionKey] || ''}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setEditedIndexes(prev => ({ ...prev, [suggestionKey]: value }));
                                    }}
                                    placeholder="Enter CREATE INDEX statements..."
                                    style={{
                                      width: '100%',
                                      minHeight: '120px',
                                      backgroundColor: '#1a1a1a',
                                      color: 'white',
                                      border: '1px solid #333',
                                      padding: '8px',
                                      borderRadius: '4px',
                                      fontFamily: 'monospace',
                                      fontSize: '14px',
                                      resize: 'vertical',
                                    }}
                                  />
                                ) : (
                                  <>
                                    <HighlightedSQL>
                                      {highlightSQL((s.suggested_indexes || '').trim())}
                                    </HighlightedSQL>
                                    {hasPerf && (
                                      <StatsTable style={{ marginTop: '12px' }}>
                                        <StatsTableBody>
                                          <StatsTableRow>
                                            <StatsTableLabelCell>Before</StatsTableLabelCell>
                                            <StatsTableValueCell>{formatNumber(s.prev_exec_time)} <NumUnit>ms</NumUnit></StatsTableValueCell>
                                            <StatsTableImprovementCell rowSpan={2}>
                                              <PerformanceBadge $improvement={improvementVal}>
                                                {improvementVal > 2.0 ? '⬆' : improvementVal < 0.8 ? '⬇' : ''} {formatNumber(improvementVal)}× improvement
                                              </PerformanceBadge>
                                            </StatsTableImprovementCell>
                                          </StatsTableRow>
                                          <StatsTableRow>
                                            <StatsTableLabelCell>After</StatsTableLabelCell>
                                            <StatsTableValueCell>
                                              {formatNumber(s.new_exec_time)} <NumUnit>ms</NumUnit>
                                            </StatsTableValueCell>
                                          </StatsTableRow>
                                        </StatsTableBody>
                                      </StatsTable>
                                    )}
                                  </>
                                )}
                              </SuggestionContent>
                            </SuggestionContainer>
                          );
                        })
                      ) : stat.suggested_indexes && (
                        <SuggestionContainer>
                          <SuggestionTitleBar $status={stat.applied_indexes ? 'applied' : 'suggested'}>
                            <SuggestionTitleGroup>
                              <StatusTag $status={stat.applied_indexes ? 'applied' : 'suggested'}>
                                {stat.applied_indexes ? 'Applied' : 'Suggested'}
                              </StatusTag>
                              {hasEditedIndexes[stat.query_id] && (
                                <span style={{ color: '#ff9500', fontSize: '0.8em', marginLeft: '8px' }}>(edited)</span>
                              )}
                            </SuggestionTitleGroup>

                            <SuggestionActionGroup>
                              {!stat.applied_indexes && !editingIndexes[stat.query_id] && (
                                <>
                                  <ActionButton
                                    $variant="secondary"
                                    onClick={() => startManualIndexEdit(stat.query_id.toString(), stat.suggested_indexes)}
                                    style={{ padding: '4px 8px' }}
                                  >
                                    ✏️ Edit
                                  </ActionButton>
                                  <ActionButton
                                    $variant="success"
                                    onClick={() => applySuggestions(stat.query_id)}
                                    disabled={loadingSuggestions[stat.query_id]}
                                  >
                                    {loadingSuggestions[stat.query_id] ? (
                                      <LoadingIndicator>Applying...</LoadingIndicator>
                                    ) : (
                                      `⬇ Apply Index${stat.suggested_indexes.trim().split(';').filter(line => line.trim()).length > 1 ? 'es' : ''}`
                                    )}
                                  </ActionButton>
                                </>
                              )}

                              {!stat.applied_indexes && editingIndexes[stat.query_id] && (
                                <ActionButton
                                  $variant="success"
                                  onClick={() => saveEditedIndexes(stat.query_id.toString())}
                                  disabled={loadingSuggestions[stat.query_id]}
                                  style={{ padding: '4px 8px' }}
                                >
                                  {loadingSuggestions[stat.query_id] ? (
                                    <LoadingIndicator>Saving...</LoadingIndicator>
                                  ) : (
                                    '💾 Save'
                                  )}
                                </ActionButton>
                              )}

                              {stat.applied_indexes && (
                                <ActionButton
                                  $variant="danger"
                                  onClick={() => revertSuggestions(stat.query_id)}
                                  disabled={loadingSuggestions[stat.query_id]}
                                >
                                  {loadingSuggestions[stat.query_id] ? (
                                    <LoadingIndicator>Reverting...</LoadingIndicator>
                                  ) : (
                                    '⬆ Revert'
                                  )}
                                </ActionButton>
                              )}
                            </SuggestionActionGroup>
                          </SuggestionTitleBar>

                          <SuggestionContent $status={stat.applied_indexes ? 'applied' : 'suggested'}>
                            {editingIndexes[stat.query_id] ? (
                              <textarea
                                value={editedIndexes[stat.query_id] || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setEditedIndexes(prev => ({ ...prev, [stat.query_id]: value }));
                                }}
                                placeholder="Enter CREATE INDEX statements..."
                                style={{
                                  width: '100%',
                                  minHeight: '120px',
                                  backgroundColor: '#1a1a1a',
                                  color: 'white',
                                  border: '1px solid #333',
                                  padding: '8px',
                                  borderRadius: '4px',
                                  fontFamily: 'monospace',
                                  fontSize: '14px',
                                  resize: 'vertical',
                                }}
                              />
                            ) : (
                              <>
                                <HighlightedSQL>
                                  {highlightSQL(stat.suggested_indexes.trim())}
                                </HighlightedSQL>
                                {hasPerformanceData && (
                                  <StatsTable style={{ marginTop: '12px' }}>
                                    <StatsTableBody>
                                      <StatsTableRow>
                                        <StatsTableLabelCell>Before</StatsTableLabelCell>
                                        <StatsTableValueCell>{formatNumber(stat.prev_exec_time)} <NumUnit>ms</NumUnit></StatsTableValueCell>
                                        <StatsTableImprovementCell rowSpan={2}>
                                          <PerformanceBadge $improvement={improvement}>
                                            {improvement > 2.0 ? '⬆' : improvement < 0.8 ? '⬇' : ''} {formatNumber(improvement)}× improvement
                                          </PerformanceBadge>
                                        </StatsTableImprovementCell>
                                      </StatsTableRow>
                                      <StatsTableRow>
                                        <StatsTableLabelCell>After</StatsTableLabelCell>
                                        <StatsTableValueCell>
                                          {formatNumber(stat.new_exec_time)} <NumUnit>ms</NumUnit>
                                        </StatsTableValueCell>
                                      </StatsTableRow>
                                    </StatsTableBody>
                                  </StatsTable>
                                )}
                              </>
                            )}
                          </SuggestionContent>
                        </SuggestionContainer>
                      )}
                      {!stat.suggested_indexes && (
                        <>
                            <p style={{ color: 'rgba(255, 255, 255, 0.5)' }}>No new index suggestions</p>
                        </>
                      )}
                      {!stat.applied_indexes && (
                        <ActionButton
                          $variant="secondary"
                          style={{ marginTop: stat.suggested_indexes ? '12px' : '0' }}
                          onClick={() => {
                            setStats(prevStats => {
                              const newStats = [...prevStats];
                              const index = newStats.findIndex(stat2 => stat2.query_id === stat.query_id);
                              newStats[index].llm_response = null;
                              newStats[index].suggested_indexes = null;
                              newStats[index].applied_indexes = null;
                              newStats[index].prev_exec_time = null;
                              newStats[index].new_exec_time = null;
                              return newStats;
                            });
                            getSuggestions(stat.query_id);
                          }}
                        >
                          ↻ Ask for more suggestions
                        </ActionButton>
                      )}
                    </>
                  )}
                </QueryActionsSection>
              </QueryCard>

              <QueryDetailsBar
                queryId={stat.query_id}
                hasLlmResponse={!!stat.llm_response}
                setStats={setStats}
                stat={stat}
              />
            </CardWrapper>
          );
        })}
      </TableContainer>
    </div>
  );
} 