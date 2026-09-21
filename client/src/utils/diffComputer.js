/**
 * Diff computation utilities for line, word and character comparisons.
 * Uses an edit-distance dynamic-programming pass and emits substitutions
 * as modifications for clearer YAML comparisons.
 */

export class DiffComputer {
  static computeLineDiff(leftLines, rightLines) {
    const result = [];
    const leftLen = leftLines.length;
    const rightLen = rightLines.length;

    const dp = Array(leftLen + 1).fill(null).map(() => Array(rightLen + 1).fill(0));

    for (let i = 1; i <= leftLen; i++) {
      dp[i][0] = i;
    }
    for (let j = 1; j <= rightLen; j++) {
      dp[0][j] = j;
    }

    for (let i = 1; i <= leftLen; i++) {
      for (let j = 1; j <= rightLen; j++) {
        if (leftLines[i - 1] === rightLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(
            dp[i - 1][j],
            dp[i][j - 1],
            dp[i - 1][j - 1]
          );
        }
      }
    }

    let i = leftLen;
    let j = rightLen;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && leftLines[i - 1] === rightLines[j - 1]) {
        result.unshift({
          type: 'equal',
          leftLine: leftLines[i - 1],
          rightLine: rightLines[j - 1],
          leftLineNumber: i,
          rightLineNumber: j
        });
        i--;
        j--;
      } else if (
        i > 0 &&
        j > 0 &&
        dp[i][j] === dp[i - 1][j - 1] + 1
      ) {
        result.unshift({
          type: 'modify',
          leftLine: leftLines[i - 1],
          rightLine: rightLines[j - 1],
          leftLineNumber: i,
          rightLineNumber: j
        });
        i--;
        j--;
      } else if (i > 0 && (j === 0 || dp[i - 1][j] <= dp[i][j - 1])) {
        result.unshift({
          type: 'delete',
          leftLine: leftLines[i - 1],
          rightLine: '',
          leftLineNumber: i,
          rightLineNumber: null
        });
        i--;
      } else {
        result.unshift({
          type: 'insert',
          leftLine: '',
          rightLine: rightLines[j - 1],
          leftLineNumber: null,
          rightLineNumber: j
        });
        j--;
      }
    }

    return result;
  }

  static computeWordDiff(leftText, rightText) {
    const leftWords = leftText.split(/(\s+)/);
    const rightWords = rightText.split(/(\s+)/);

    return this.computeLineDiff(leftWords, rightWords);
  }

  static computeCharacterDiff(leftText, rightText) {
    const leftChars = leftText.split('');
    const rightChars = rightText.split('');

    return this.computeLineDiff(leftChars, rightChars);
  }

  static getDiffStats(diffResult) {
    const stats = {
      additions: 0,
      deletions: 0,
      modifications: 0,
      unchanged: 0
    };

    diffResult.forEach(diff => {
      switch (diff.type) {
        case 'insert':
          stats.additions++;
          break;
        case 'delete':
          stats.deletions++;
          break;
        case 'modify':
          stats.modifications++;
          break;
        case 'equal':
          stats.unchanged++;
          break;
      }
    });

    return stats;
  }

  static generateUnifiedDiff(diffResult, leftFilename = 'Original', rightFilename = 'Modified') {
    let result = `--- ${leftFilename}\n+++ ${rightFilename}\n`;

    let currentHunk = [];
    let leftLineNum = 1;
    let _rightLineNum = 1;
    let hunkStart = 1;

    const flushHunk = () => {
      if (currentHunk.length === 0) return;

      const leftCount = currentHunk.filter(line => line.type !== 'insert').length;
      const rightCount = currentHunk.filter(line => line.type !== 'delete').length;

      result += `@@ -${hunkStart},${leftCount} +${hunkStart},${rightCount} @@\n`;
      result += currentHunk.map(line => {
        switch (line.type) {
          case 'delete':
            return `-${line.leftLine}`;
          case 'insert':
            return `+${line.rightLine}`;
          case 'modify':
            return `-${line.leftLine}\n+${line.rightLine}`;
          case 'equal':
            return ` ${line.leftLine}`;
          default:
            return ` ${line.leftLine}`;
        }
      }).join('\n') + '\n';

      currentHunk = [];
    };

    diffResult.forEach(diff => {
      if (diff.type === 'equal') {
        if (currentHunk.length > 0) {
          currentHunk.push(diff);
          if (currentHunk.length > 6) {
            flushHunk();
            hunkStart = leftLineNum;
          }
        }
      } else {
        if (currentHunk.length === 0) {
          hunkStart = leftLineNum;
        }
        currentHunk.push(diff);
      }

      if (diff.type !== 'insert') leftLineNum++;
      if (diff.type !== 'delete') _rightLineNum++;
    });

    flushHunk();

    return result;
  }
}

export default DiffComputer;
