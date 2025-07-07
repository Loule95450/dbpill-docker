import { useState } from 'react';
import { queryApi } from '../utils/HttpApi';
import {
  ActionButton,
  LoadingIndicator,
} from '../styles/Styled';
import { SuggestionBox } from './SuggestionBox';

interface QuerySuggestionsProps {
  stat: any;
  loadingSuggestions: { [key: string]: boolean };
  setLoadingSuggestions: (fn: (prev: { [key: string]: boolean }) => { [key: string]: boolean }) => void;
  setStats: (fn: (prevStats: any[]) => any[]) => void;
  getSuggestions: (queryId: string) => Promise<void>;
}

export function QuerySuggestions({
  stat,
  loadingSuggestions,
  setLoadingSuggestions,
  setStats,
  getSuggestions,
}: QuerySuggestionsProps) {
  const createManualSuggestion = async () => {
    setLoadingSuggestions(prev => ({ ...prev, [stat.query_id]: true }));
    
    try {
      const data = await queryApi.createManualSuggestion(stat.query_id);
      setStats(prevStats => {
        const newStats = [...prevStats];
        const index = newStats.findIndex(s => s.query_id === stat.query_id);
        if (index !== -1) {
          newStats[index] = data;
        }
        return newStats;
      });
    } catch (error: any) {
      alert(error.message || 'Error creating manual suggestion');
    } finally {
      setLoadingSuggestions(prev => ({ ...prev, [stat.query_id]: false }));
    }
  };

  const handleSuggestionUpdate = (updatedStat: any) => {
    setStats(prevStats => {
      const newStats = [...prevStats];
      const index = newStats.findIndex(s => s.query_id === stat.query_id);
      if (index !== -1) {
        newStats[index] = updatedStat;
      }
      return newStats;
    });
  };

  const handleSuggestionDelete = (suggestionIndex: number) => {
    // This will be handled by the API response in handleSuggestionUpdate
    // No additional action needed here
  };

  // No LLM response yet - show initial buttons
  if (!stat.llm_response) {
    return (
      <>
        <ActionButton
          $variant="ai-suggestion"
          onClick={() => getSuggestions(stat.query_id)}
          disabled={loadingSuggestions[stat.query_id]}
        >
          {loadingSuggestions[stat.query_id] ? (
            <LoadingIndicator>Getting suggestions...</LoadingIndicator>
          ) : (
            '🤖 Get AI suggested indexes'
          )}
        </ActionButton>
        <ActionButton
          $variant="secondary"
          onClick={createManualSuggestion}
          disabled={loadingSuggestions[stat.query_id]}
          style={{ marginLeft: '8px', marginTop: '8px' }}
        >
          {loadingSuggestions[stat.query_id] ? (
            <LoadingIndicator>Creating...</LoadingIndicator>
          ) : (
            '✎ Add custom index'
          )}
        </ActionButton>
      </>
    );
  }

  // Has LLM response - render suggestions
  return (
    <>
      {/* Render list of suggestions if available */}
      {stat.suggestions && Array.isArray(stat.suggestions) && stat.suggestions.length > 0 ? (
        stat.suggestions.slice().reverse().map((suggestion: any, reverseIdx: number) => {
          // Since we reversed the array, reverseIdx 0 = oldest suggestion, should be numbered 1
          const suggestionNumber = reverseIdx + 1;
          const statusText = stat.suggestions.length > 1 ? `Suggestion ${suggestionNumber}` : 'Suggestion';
          // Use the original index for the key (newest suggestions have lower original indexes)
          const originalIdx = stat.suggestions.length - 1 - reverseIdx;
          
          return (
            <SuggestionBox
              key={reverseIdx}
              suggestion={suggestion}
              queryId={stat.query_id.toString()}
              suggestionIndex={originalIdx}
              statusText={statusText}
              onUpdate={handleSuggestionUpdate}
              onDelete={handleSuggestionDelete}
            />
          );
        })
      ) : stat.suggested_indexes && (
        // Legacy single suggestion - convert to same format and use unified renderer
        <SuggestionBox
          suggestion={{
            suggested_indexes: stat.suggested_indexes,
            applied: !!stat.applied_indexes,
            reverted: !stat.applied_indexes && stat.new_exec_time && stat.prev_exec_time,
            prev_exec_time: stat.prev_exec_time,
            new_exec_time: stat.new_exec_time,
          }}
          queryId={stat.query_id.toString()}
          suggestionIndex={0}
          statusText="Suggestion"
          onUpdate={handleSuggestionUpdate}
          onDelete={handleSuggestionDelete}
        />
      )}
      
      {!stat.suggested_indexes && (
        <p style={{ color: 'rgba(255, 255, 255, 0.5)' }}>No new index suggestions</p>
      )}
      
      {!stat.applied_indexes && (
        <div>
          <ActionButton
            $variant="secondary"
            style={{ marginRight: 10 }}
            onClick={() => getSuggestions(stat.query_id)}
            disabled={loadingSuggestions[stat.query_id]}
          >
            {loadingSuggestions[stat.query_id] ? (
              <LoadingIndicator>Getting more suggestions...</LoadingIndicator>
            ) : (
              '🤖 Ask for more'
            )}
          </ActionButton>
          <ActionButton
            $variant="secondary"
            style={{  }}
            onClick={createManualSuggestion}
            disabled={loadingSuggestions[stat.query_id]}
          >
            {loadingSuggestions[stat.query_id] ? (
              <LoadingIndicator>Creating...</LoadingIndicator>
            ) : (
              '✎ Add custom'
            )}
          </ActionButton>
        </div   >
      )}
    </>
  );
} 