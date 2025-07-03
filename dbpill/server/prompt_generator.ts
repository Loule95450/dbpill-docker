export interface SuggestionPromptParams {
  queryText: string;
  queryPlanJson: any;
  tableDefinitions: string[];
  appliedIndexes?: string | null;
  suggestionHistory?: any[];
}

/**
 * Generate the full prompt sent to the LLM for index suggestions based on
 * the query, its plan and table metadata.
 */
export function generateSuggestionPrompt({
  queryText,
  queryPlanJson,
  tableDefinitions,
  appliedIndexes,
  suggestionHistory = [],
}: SuggestionPromptParams): string {
  // Generate suggestion history section
  let historySection = '';
  if (suggestionHistory && suggestionHistory.length > 0) {
    historySection = `\n## Previous Suggestion History\n\n`;
    historySection += `The following index suggestions have been tried previously for this query. Please learn from these attempts and suggest something different that might work better:\n\n`;
    
    // Reverse the array to show chronological order (oldest first)
    const chronologicalHistory = [...suggestionHistory].reverse();
    
    chronologicalHistory.forEach((suggestion, index) => {
      const suggestionNum = index + 1; // Start from 1 for oldest attempt
      historySection += `### Attempt #${suggestionNum}\n`;
      historySection += `**Status**: ${suggestion.reverted ? 'Applied and then REVERTED (did not help)' : suggestion.applied ? 'Currently APPLIED' : 'Suggested but not applied'}\n`;
      historySection += `**Suggested indexes**:\n\`\`\`sql\n${suggestion.suggested_indexes || 'None'}\n\`\`\`\n`;
      
      if (suggestion.prev_exec_time && suggestion.new_exec_time) {
        const improvement = suggestion.prev_exec_time / suggestion.new_exec_time;
        historySection += `**Performance impact**: ${suggestion.prev_exec_time.toFixed(2)}ms → ${suggestion.new_exec_time.toFixed(2)}ms (${improvement.toFixed(2)}x ${improvement > 1 ? 'improvement' : 'degradation'})\n`;
        
        if (suggestion.reverted) {
          historySection += `**Why it was reverted**: This suggestion was reverted because it ${improvement < 1 ? 'made the query slower' : 'did not provide sufficient improvement'}\n`;
        }
      } else {
        historySection += `**Performance impact**: Not measured\n`;
      }
      
      if (suggestion.llm_response && suggestion.llm_response !== 'Manual suggestion') {
        // Extract reasoning from LLM response if available
        const reasoning = suggestion.llm_response.split('```')[0].trim();
        if (reasoning.length > 50) {
          historySection += `**AI reasoning**: ${reasoning.substring(0, 300)}${reasoning.length > 300 ? '...' : ''}\n`;
        }
      }
      
      historySection += `\n`;
    });
    
    historySection += `**Important**: Based on this history, please suggest a completely different approach. If previous attempts focused on certain columns or index types, try a different strategy.\n\n`;
  }

  return `Given the following PostgreSQL query, query plan & table definitions, suggest only one index improvement that would result in significantly faster query execution. Generally avoid partial indexes unless you're *certain* it will lead to orders-of-magnitude improvements. Think through the query, the query plan, the indexes the plan used, the indexes already present on the tables, and come up with a plan. Then, provide a single code block with all the index proposals together at the end. i.e.:
\u0060\u0060\u0060sql
CREATE INDEX dbpill_index_name_upper ON table_name (column_name1, some_function(column_name2));
\u0060\u0060\u0060

Make sure the suggested index is to improve the provided query specifically, not other hypothetical queries. Pay close attention to the query, and make sure any data transformation in the where clause is also applied to the index declaration.

Always prefix the index name with dbpill_ to avoid conflicts with existing indexes.

Here are some general guidelines for index suggestions:

Index Scan vs. Index Only Scan: If you see many Index Scans where Index Only Scans could be used, it might indicate that you could benefit from including more columns in your index.

Bitmap Heap Scan followed by Bitmap Index Scan: While not necessarily bad, these can sometimes be improved by creating a more specific index.

High-cost Index Scans: If the cost of an Index Scan is unexpectedly high, it might indicate that the index is not selective enough.

Filter operations after Seq Scan or Index Scan: This often indicates that the filter condition could be included in an index.

Large number of rows in Seq Scan: If a Seq Scan is reading a large portion of a big table, an index might help.

Sort operations: If you see expensive sort operations, consider if an index could eliminate the need for sorting.

Hash Join or Merge Join instead of Nested Loop: For join operations, if you're seeing Hash Joins or Merge Joins where you expect Nested Loops, it might indicate missing join indexes.

High-cost Nested Loop operations: Even with Nested Loops, if the cost is high, better indexes might help.

Multiple Index Scans on the same table: This might suggest that a multi-column index could be beneficial.

Parallel operations on smaller tables: If PostgreSQL is using parallel operations on relatively small tables, it might indicate missing indexes.

${historySection}
## Query details

${queryText}

## Query Plan

${JSON.stringify(queryPlanJson, null, 2)}

## Table Definitions

${tableDefinitions.join('\n\n')}

${appliedIndexes ? `\n## Currently Applied Indexes\n\nThe following indexes are currently applied to the database:\n${appliedIndexes}\n` : ``}
`;
} 