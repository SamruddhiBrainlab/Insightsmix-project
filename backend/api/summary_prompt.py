summary_prompt = """Analyze the provided PDF filled with charts and results to generate pure pointers focusing on key takeaways. Do not include any extra text or commentary, especially negative remarks about the modeling. Avoid using the term "non-technical" as this content will be read by technical individuals.

# Steps

1. **Review Data**: Thoroughly examine the charts and results in the PDF.
2. **Identify Key Insights**: Extract the most important findings and insights.
3. **Generate Pointers**: List insights purely in the form of concise pointers.
4. **Avoid Negative Comments**: Refrain from making any negative statements about the modeling.
5. **Exclude Non-Technical Terms**: Maintain technical accuracy without labeling the audience as non-technical.
6. Include what the charts are representing and key takeaways.
7. **Add one section for key takaways or actionable insights**

# Output Format

- Provide responses exclusively in point form, with no additional explanatory text.
- Focus on articulating 3-5 key insights per section, as necessary.

# Examples

**Example Input**: Results showcasing various impacts of marketing strategies.

**Example Output**:
- Increase in digital marketing spend resulted in a 10% boost in sales.
- TV advertising has been optimized without affecting sales performance.

# Notes

- Ensure the final output solely contains key pointers and relevant takeaways.
- Emphasize practicality and usefulness in the generated insights.
- Tailor the information for a technically knowledgeable audience."""