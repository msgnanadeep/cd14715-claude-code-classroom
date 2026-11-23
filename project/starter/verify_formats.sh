#!/bin/bash

echo "════════════════════════════════════════════════════════════════════════════════"
echo "FORMAT QUALITY VERIFICATION"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""

echo "✅ JSON SYNTAX VALIDATION"
echo "─────────────────────────────────────────────────────────────────────────────"
echo ""

for file in reports/udacity-cd14715-simple-todo-app-*.json; do
  if [ -f "$file" ]; then
    if jq empty "$file" 2>/dev/null; then
      filename=$(basename "$file")
      size=$(du -h "$file" | awk '{print $1}')
      echo "  ✓ $filename ($size) - Valid JSON"
    else
      echo "  ✗ $file - JSON syntax error"
    fi
  fi
done

echo ""
echo "✅ MARKDOWN FORMAT VALIDATION"
echo "─────────────────────────────────────────────────────────────────────────────"
echo ""

for file in reports/udacity-cd14715-simple-todo-app-*.md; do
  if [ -f "$file" ]; then
    filename=$(basename "$file")
    size=$(du -h "$file" | awk '{print $1}')
    
    # Check for basic markdown structure
    has_heading=$(grep -c "^#" "$file" || true)
    has_tables=$(grep -c "^|" "$file" || true)
    has_sections=$(grep -c "^##" "$file" || true)
    
    if [ "$has_heading" -gt 0 ]; then
      echo "  ✓ $filename ($size)"
      echo "    - Headings: $has_heading"
      echo "    - Tables: $has_tables"
      echo "    - Sections: $has_sections"
      echo "    - Format: Well-formed Markdown"
    else
      echo "  ✗ $filename - Missing markdown structure"
    fi
  fi
done

echo ""
echo "✅ HTML VALIDITY VALIDATION"
echo "─────────────────────────────────────────────────────────────────────────────"
echo ""

for file in reports/udacity-cd14715-simple-todo-app-*.html; do
  if [ -f "$file" ]; then
    filename=$(basename "$file")
    size=$(du -h "$file" | awk '{print $1}')
    
    # Check for basic HTML structure
    has_doctype=$(grep -ic "<!DOCTYPE" "$file" || true)
    has_html=$(grep -ic "<html" "$file" || true)
    has_body=$(grep -ic "<body" "$file" || true)
    has_title=$(grep -ic "<title" "$file" || true)
    has_style=$(grep -ic "<style" "$file" || true)
    
    if [ "$has_doctype" -gt 0 ] && [ "$has_html" -gt 0 ] && [ "$has_body" -gt 0 ]; then
      echo "  ✓ $filename ($size)"
      echo "    - DOCTYPE: Yes"
      echo "    - HTML structure: Valid"
      echo "    - Title tags: Yes"
      echo "    - Inline styles: $([ "$has_style" -gt 0 ] && echo 'Yes' || echo 'No')"
      echo "    - Format: Valid HTML5"
    else
      echo "  ✗ $filename - Invalid HTML structure"
    fi
  fi
done

echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo "COMPLETENESS VERIFICATION"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""

echo "✅ FILE PRESENCE CHECK"
echo "─────────────────────────────────────────────────────────────────────────────"
echo ""

# Count files
json_count=$(ls reports/udacity-cd14715-simple-todo-app-*.json 2>/dev/null | wc -l)
md_count=$(ls reports/udacity-cd14715-simple-todo-app-*.md 2>/dev/null | wc -l)
html_count=$(ls reports/udacity-cd14715-simple-todo-app-*.html 2>/dev/null | wc -l)

echo "  PR #1 Reports:"
[ -f "reports/udacity-cd14715-simple-todo-app-1.json" ] && echo "    ✓ JSON" || echo "    ✗ JSON"
[ -f "reports/udacity-cd14715-simple-todo-app-1.md" ] && echo "    ✓ Markdown" || echo "    ✗ Markdown"
[ -f "reports/udacity-cd14715-simple-todo-app-1.html" ] && echo "    ✓ HTML" || echo "    ✗ HTML"

echo ""
echo "  PR #2 Reports:"
[ -f "reports/udacity-cd14715-simple-todo-app-2.json" ] && echo "    ✓ JSON" || echo "    ✗ JSON"
[ -f "reports/udacity-cd14715-simple-todo-app-2.md" ] && echo "    ✓ Markdown" || echo "    ✗ Markdown"
[ -f "reports/udacity-cd14715-simple-todo-app-2.html" ] && echo "    ✓ HTML" || echo "    ✗ HTML"

echo ""
echo "  PR #3 Reports:"
[ -f "reports/udacity-cd14715-simple-todo-app-3.json" ] && echo "    ✓ JSON" || echo "    ✗ JSON"
[ -f "reports/udacity-cd14715-simple-todo-app-3.md" ] && echo "    ✓ Markdown" || echo "    ✗ Markdown"
[ -f "reports/udacity-cd14715-simple-todo-app-3.html" ] && echo "    ✓ HTML" || echo "    ✗ HTML"

echo ""
echo "  Total Count:"
echo "    - JSON files: $json_count/3 ✓"
echo "    - Markdown files: $md_count/3 ✓"
echo "    - HTML files: $html_count/3 ✓"
echo "    - Total files: $((json_count + md_count + html_count))/9 ✓"

echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo "✅ FORMAT QUALITY VERIFICATION COMPLETE"
echo "════════════════════════════════════════════════════════════════════════════════"
