import { useState } from 'react';
import { queryApi } from '../utils/HttpApi';
import {
  ActionButton,
  LoadingIndicator,
  StatusTag,
  SuggestionContent,
  HighlightedSQL,
  StatsTable,
  StatsTableBody,
  StatsTableRow,
  StatsTableLabelCell,
  StatsTableValueCell,
  StatsTableImprovementCell,
  SuggestionTitleBar,
  SuggestionTitleGroup,
  SuggestionActionGroup,
  SuggestionContainer,
  DeleteSuggestionButton,
  PerformanceBadge,
  NumUnit,
} from '../styles/Styled';
import { formatNumber } from '../utils/formatNumber';
import { highlightSQL } from '../utils/sqlHighlighter';

interface SuggestionBoxProps {
  suggestion: any;
  queryId: string;
  suggestionIndex: number;
  statusText: string;
  onUpdate: (updatedStat: any) => void;
  onDelete: (suggestionIndex: number) => void;
}

export function SuggestionBox({
  suggestion,
  queryId,
  suggestionIndex,
  statusText,
  onUpdate,
  onDelete,
}: SuggestionBoxProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedIndexes, setEditedIndexes] = useState(suggestion.suggested_indexes || '');
  const [originalIndexes, setOriginalIndexes] = useState(suggestion.suggested_indexes || '');
  const [hasBeenEdited, setHasBeenEdited] = useState(false);

  const isReverted = !!suggestion.reverted;
  const isApplied = !!suggestion.applied && !isReverted;
  const isSuggested = !suggestion.applied && !isReverted;
  const status: 'reverted' | 'applied' | 'suggested' = isReverted ? 'reverted' : isApplied ? 'applied' : 'suggested';

  const startEdit = () => {
    const initialContent = suggestion.suggested_indexes || '';
    setEditedIndexes(initialContent);
    setOriginalIndexes(initialContent);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditedIndexes(originalIndexes);
  };

  const saveEdit = async () => {
    setIsLoading(true);
    
    try {
      const requestBody: any = {
        query_id: queryId,
        suggested_indexes: editedIndexes
      };
      
      if (suggestion.suggestion_id) {
        requestBody.suggestion_id = suggestion.suggestion_id;
      }
      
      const data = await queryApi.saveEditedIndexes(queryId, editedIndexes, suggestion.suggestion_id);
      onUpdate(data);
      setHasBeenEdited(true);
      setIsEditing(false);
    } catch (error: any) {
      alert(error.message || 'Error saving edited indexes');
    } finally {
      setIsLoading(false);
    }
  };

  const applySuggestion = async () => {
    setIsLoading(true);
    try {
      const data = await queryApi.applySuggestions(queryId, suggestion.suggestion_id);
      onUpdate(data);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const revertSuggestion = async () => {
    setIsLoading(true);
    try {
      const data = await queryApi.revertSuggestions(queryId, suggestion.suggestion_id);
      onUpdate(data);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteSuggestion = async () => {
    if (!confirm('Are you sure you want to delete this suggestion?')) {
      return;
    }

    setIsLoading(true);
    
    try {
      const data = await queryApi.deleteSuggestion(suggestion.suggestion_id);
      onDelete(suggestionIndex);
      onUpdate(data);
    } catch (error: any) {
      alert(error.message || 'Error deleting suggestion');
    } finally {
      setIsLoading(false);
    }
  };

  const renderActions = () => {
    return (
      <SuggestionActionGroup>
        {isSuggested && !isEditing && (
          <>
            <ActionButton
              $variant="secondary"
              onClick={startEdit}
              style={{ padding: '4px 8px' }}
              disabled={isLoading}
            >
              ✎ Edit
            </ActionButton>
            <ActionButton
              $variant="success"
              onClick={applySuggestion}
              disabled={isLoading}
            >
              {isLoading ? (
                <LoadingIndicator>Applying...</LoadingIndicator>
              ) : (
                `⬇ Apply Index${suggestion.suggested_indexes && suggestion.suggested_indexes.trim().split(';').filter(line => line.trim()).length > 1 ? 'es' : ''}`
              )}
            </ActionButton>
          </>
        )}

        {isSuggested && isEditing && (
          <>
            {editedIndexes !== originalIndexes && (
              <ActionButton
                $variant="success"
                onClick={saveEdit}
                disabled={isLoading}
                style={{ padding: '4px 8px', marginRight: '4px' }}
              >
                {isLoading ? (
                  <LoadingIndicator>Saving...</LoadingIndicator>
                ) : (
                  '💾 Save'
                )}
              </ActionButton>
            )}
            <ActionButton
              $variant="secondary"
              onClick={cancelEdit}
              disabled={isLoading}
              style={{ padding: '4px 8px' }}
            >
              {isLoading ? (
                <LoadingIndicator>Canceling...</LoadingIndicator>
              ) : (
                '✕ Cancel'
              )}
            </ActionButton>
          </>
        )}

        {isApplied && (
          <>
            <span style={{ color: 'rgba(200, 255, 200, 1)', fontSize: '0.8em', marginRight: '8px' }}>Applied</span>
            <ActionButton
              $variant="danger"
              onClick={revertSuggestion}
              disabled={isLoading}
            >
              {isLoading ? (
                <LoadingIndicator>Reverting...</LoadingIndicator>
              ) : (
                '⬆ Revert'
              )}
            </ActionButton>
          </>
        )}

        {isReverted && !isEditing && (
          <>
            <ActionButton
              $variant="secondary"
              onClick={startEdit}
              style={{ padding: '4px 8px' }}
              disabled={isLoading}
            >
              ✎ Edit
            </ActionButton>
            <ActionButton
              $variant="success"
              onClick={applySuggestion}
              disabled={isLoading}
            >
              {isLoading ? (
                <LoadingIndicator>Re-applying...</LoadingIndicator>
              ) : (
                `⬇ Re-apply${suggestion.suggested_indexes && suggestion.suggested_indexes.trim().split(';').filter(line => line.trim()).length > 1 ? ' Indexes' : ''}`
              )}
            </ActionButton>
          </>
        )}

        {isReverted && isEditing && (
          <>
            {editedIndexes !== originalIndexes && (
              <ActionButton
                $variant="success"
                onClick={saveEdit}
                disabled={isLoading}
                style={{ padding: '4px 8px', marginRight: '4px' }}
              >
                {isLoading ? (
                  <LoadingIndicator>Saving...</LoadingIndicator>
                ) : (
                  '💾 Save'
                )}
              </ActionButton>
            )}
            <ActionButton
              $variant="secondary"
              onClick={cancelEdit}
              disabled={isLoading}
              style={{ padding: '4px 8px' }}
            >
              {isLoading ? (
                <LoadingIndicator>Canceling...</LoadingIndicator>
              ) : (
                '✕ Cancel'
              )}
            </ActionButton>
          </>
        )}
      </SuggestionActionGroup>
    );
  };

  const renderContent = () => {
    const hasPerf = suggestion.prev_exec_time !== null && suggestion.new_exec_time !== null && 
                    suggestion.prev_exec_time !== undefined && suggestion.new_exec_time !== undefined;
    const improvementVal = hasPerf ? (suggestion.prev_exec_time / suggestion.new_exec_time) : 0;

    return (
      <SuggestionContent $status={status}>
        {isEditing ? (
          <textarea
            value={editedIndexes}
            onChange={(e) => setEditedIndexes(e.target.value)}
            placeholder="CREATE INDEX dbpill_your_index_name ON table_name (column1, column2);"
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
              {highlightSQL((suggestion.suggested_indexes || '').trim())}
            </HighlightedSQL>
            {hasPerf && (
              <StatsTable style={{ marginTop: '12px' }}>
                <StatsTableBody>
                  <StatsTableRow>
                    <StatsTableLabelCell>Before</StatsTableLabelCell>
                    <StatsTableValueCell>{formatNumber(suggestion.prev_exec_time)} <NumUnit>ms</NumUnit></StatsTableValueCell>
                    <StatsTableImprovementCell rowSpan={2}>
                      <PerformanceBadge $improvement={isReverted ? NaN : improvementVal}>
                        {improvementVal > 2.0 ? '⬆' : improvementVal < 0.8 ? '⬇' : ''} {formatNumber(improvementVal)}× improvement
                      </PerformanceBadge>
                    </StatsTableImprovementCell>
                  </StatsTableRow>
                  <StatsTableRow>
                    <StatsTableLabelCell>After</StatsTableLabelCell>
                    <StatsTableValueCell>
                      {formatNumber(suggestion.new_exec_time)} <NumUnit>ms</NumUnit>
                    </StatsTableValueCell>
                  </StatsTableRow>
                </StatsTableBody>
              </StatsTable>
            )}
            {isReverted && (
              <div style={{ 
                marginTop: '12px',
                padding: '8px',
                backgroundColor: 'rgba(255, 68, 68, 0.1)',
                border: '1px solid rgba(255, 68, 68, 0.3)',
                borderRadius: '4px',
                color: '#ff4444',
                fontSize: '0.85em',
                fontWeight: 'bold',
                textAlign: 'center'
              }}>
                This index has been reverted
              </div>
            )}
          </>
        )}
      </SuggestionContent>
    );
  };

  return (
    <SuggestionContainer>
      {suggestion.suggestion_id && (
        <DeleteSuggestionButton
          onClick={deleteSuggestion}
          title="Delete suggestion"
        >
          ✕
        </DeleteSuggestionButton>
      )}
      <SuggestionTitleBar $status={status}>
        <SuggestionTitleGroup>
          <StatusTag $status={isApplied ? 'applied' : 'suggested'}>
            {statusText}
          </StatusTag>
          {hasBeenEdited && (
            <span style={{ color: '#ff9500', fontSize: '0.8em', marginLeft: '8px' }}>(edited)</span>
          )}
        </SuggestionTitleGroup>

        {renderActions()}
      </SuggestionTitleBar>

      {renderContent()}
    </SuggestionContainer>
  );
} 