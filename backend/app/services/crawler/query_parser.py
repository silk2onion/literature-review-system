"""
布尔查询解析器

将用户输入的包含 OR / AND 布尔运算符的查询字符串拆解为
可以被不支持布尔语法的 API（如 Semantic Scholar、CrossRef）执行的多个子查询。

支持语法：
- OR (大小写不敏感): 将查询拆为多个并行子查询，结果合并去重
- AND (大小写不敏感): 将多个词组合为一个查询（空格连接即 AND 语义）
- 引号短语: "transit oriented development" 作为整体短语
- 括号分组: (TOD OR "transit oriented development") AND qingdao

示例：
  输入: 'TOD OR "transit oriented development" AND qingdao'
  输出: ["TOD qingdao", "transit oriented development qingdao"]

  输入: '(TOD OR "transit oriented development") AND (qingdao OR "urban rail")'
  输出: ["TOD qingdao", "TOD urban rail",
         "transit oriented development qingdao",
         "transit oriented development urban rail"]

  输入: 'machine learning'
  输出: ["machine learning"]  (无布尔运算符时原样返回)
"""

import logging
import re
from itertools import product
from typing import List

logger = logging.getLogger(__name__)


def _tokenize(query: str) -> List[str]:
    """
    将查询字符串分词为 token 列表。

    Token 类型:
    - 'AND', 'OR': 布尔运算符（大小写不敏感）
    - '(', ')': 括号
    - '"some phrase"': 带引号的短语（保留引号内的空格）
    - 'word': 普通单词
    """
    tokens: List[str] = []
    i = 0
    n = len(query)

    while i < n:
        ch = query[i]

        # 跳过空白
        if ch.isspace():
            i += 1
            continue

        # 括号
        if ch in ('(', ')'):
            tokens.append(ch)
            i += 1
            continue

        # 带引号的短语
        if ch == '"':
            j = query.find('"', i + 1)
            if j == -1:
                # 未闭合引号，取到末尾
                phrase = query[i + 1:].strip()
                tokens.append(phrase)
                i = n
            else:
                phrase = query[i + 1:j].strip()
                if phrase:
                    tokens.append(phrase)
                i = j + 1
            continue

        # 普通词（到空白、括号或引号为止）
        j = i
        while j < n and not query[j].isspace() and query[j] not in ('(', ')', '"'):
            j += 1
        word = query[i:j]

        # 判断是否是布尔运算符
        if word.upper() in ('AND', 'OR'):
            tokens.append(word.upper())
        else:
            tokens.append(word)

        i = j

    return tokens


def _parse_expression(tokens: List[str], pos: int) -> tuple:
    """
    递归下降解析器，解析布尔表达式。

    语法（优先级从低到高）：
      expression := or_expr
      or_expr    := and_expr ('OR' and_expr)*
      and_expr   := atom ('AND'? atom)*    (隐式 AND: 相邻的非运算符 token)
      atom       := '(' expression ')' | term

    返回: (result, next_pos)
      result 是一个嵌套结构:
        - 字符串: 单个词/短语
        - ('AND', [子表达式列表])
        - ('OR', [子表达式列表])
    """
    result, pos = _parse_or(tokens, pos)
    return result, pos


def _parse_or(tokens: List[str], pos: int) -> tuple:
    """
    解析 AND 表达式（最低优先级）。

    优先级设计：在学术搜索场景中，用户写
      "TOD OR transit oriented development AND qingdao"
    实际意图通常是
      "(TOD OR transit oriented development) AND qingdao"
    即先做 OR 分组，再整体与 AND 右侧合并。

    因此 OR 的绑定优先级高于 AND：
      expression → and_level
      and_level  → or_level ('AND' or_level)*
      or_level   → atom ('OR' atom)*
    """
    left, pos = _parse_and(tokens, pos)
    parts = [left]

    while pos < len(tokens) and tokens[pos] == 'AND':
        pos += 1  # 跳过 AND
        right, pos = _parse_and(tokens, pos)
        parts.append(right)

    if len(parts) == 1:
        return parts[0], pos
    return ('AND', parts), pos


def _parse_and(tokens: List[str], pos: int) -> tuple:
    """解析 OR 表达式（比 AND 优先级更高，绑定更紧）"""
    left, pos = _parse_atom(tokens, pos)
    parts = [left]

    while pos < len(tokens) and tokens[pos] == 'OR':
        pos += 1  # 跳过 OR
        right, pos = _parse_atom(tokens, pos)
        parts.append(right)

    if len(parts) == 1:
        return parts[0], pos
    return ('OR', parts), pos


def _parse_atom(tokens: List[str], pos: int) -> tuple:
    """
    解析原子表达式：括号分组或普通词/短语。

    连续的非运算符、非括号 token 会被合并为一个短语（隐式连接）。
    例如 tokens = ['smart', 'growth'] → 返回 'smart growth'
    这样 "smart growth OR new urbanism" 中的 "smart growth" 会被视为一个整体。
    """
    if pos >= len(tokens):
        return '', pos

    if tokens[pos] == '(':
        pos += 1  # 跳过 (
        result, pos = _parse_expression(tokens, pos)
        if pos < len(tokens) and tokens[pos] == ')':
            pos += 1  # 跳过 )
        return result, pos

    # 收集连续的普通词/短语 token（遇到运算符或括号时停止）
    words = [tokens[pos]]
    pos += 1
    while pos < len(tokens) and tokens[pos] not in ('AND', 'OR', '(', ')'):
        words.append(tokens[pos])
        pos += 1

    term = ' '.join(words)
    return term, pos


def _expand_to_queries(tree) -> List[List[str]]:
    """
    将解析树展开为查询列表。

    每个查询是一个词列表（AND 关系），多个查询之间是 OR 关系。

    返回: List[List[str]]
      例如: [["TOD", "qingdao"], ["transit oriented development", "qingdao"]]
    """
    if isinstance(tree, str):
        if not tree:
            return [[]]
        return [[tree]]

    op, children = tree

    if op == 'AND':
        # AND: 对所有子节点做笛卡尔积
        child_expansions = [_expand_to_queries(child) for child in children]
        result = [[]]
        for expansion in child_expansions:
            new_result = []
            for existing in result:
                for addition in expansion:
                    new_result.append(existing + addition)
            result = new_result
        return result

    elif op == 'OR':
        # OR: 合并所有子节点的展开结果
        result = []
        for child in children:
            result.extend(_expand_to_queries(child))
        return result

    return [[]]


def parse_boolean_query(query: str) -> List[str]:
    """
    将包含 OR/AND 布尔运算符的查询字符串解析为多个简单查询字符串。

    每个返回的字符串可以直接传给不支持布尔语法的 API。
    多个返回结果之间的关系是 OR（合并去重）。

    Args:
        query: 用户输入的查询字符串，可能包含 OR/AND/引号/括号

    Returns:
        简单查询字符串列表，每个字符串内的词之间是 AND 关系

    示例:
        >>> parse_boolean_query('TOD OR "transit oriented development" AND qingdao')
        ['TOD qingdao', 'transit oriented development qingdao']

        >>> parse_boolean_query('(TOD OR "transit oriented development") AND (qingdao OR "urban rail")')
        ['TOD qingdao', 'TOD urban rail',
         'transit oriented development qingdao',
         'transit oriented development urban rail']

        >>> parse_boolean_query('machine learning')
        ['machine learning']
    """
    if not query or not query.strip():
        return []

    stripped = query.strip()

    # 快速路径：如果没有 OR/AND 运算符且没有括号，直接返回原查询
    has_operators = bool(re.search(r'\b(AND|OR)\b', stripped, re.IGNORECASE))
    has_parens = '(' in stripped or ')' in stripped
    if not has_operators and not has_parens:
        return [stripped]

    try:
        tokens = _tokenize(stripped)
        if not tokens:
            return [stripped]

        tree, _ = _parse_expression(tokens, 0)
        expanded = _expand_to_queries(tree)

        # 将每个子查询的词列表拼接为字符串
        queries = []
        for word_list in expanded:
            # 过滤空字符串
            filtered = [w for w in word_list if w]
            if filtered:
                q = ' '.join(filtered)
                if q not in queries:  # 去重
                    queries.append(q)

        if not queries:
            return [stripped]

        logger.info(
            "[QueryParser] 解析布尔查询: %r → %d 个子查询: %s",
            stripped, len(queries), queries,
        )
        return queries

    except Exception as e:
        logger.warning(
            "[QueryParser] 解析失败，回退为原始查询: %r error=%s", stripped, e,
        )
        return [stripped]
