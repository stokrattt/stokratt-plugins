# Reference checklist example

A sample for calibrating the level of detail and the
`structural`/`behavioral` classification. The format follows `output-template.md`.

## Input requirements (example)

- REQ-1: The Category select filters the product list by category. Default: "All categories".
- REQ-2: The Subcategory select depends on the category; with "All categories" it is disabled.
- REQ-3: The "Quantity" field in the cart accepts at most 10 units of one product.

## Checklist (example)

### REQ-1: The Category select filters the product list by category

- [ ] **REQ-1.1** The Category filter is present on the page _(structural)_
- [ ] **REQ-1.2** The Category filter is a select (dropdown) _(structural)_
- [ ] **REQ-1.3** The category list is filled with options _(structural)_
- [ ] **REQ-1.4** The default state is "All categories" (nothing selected) _(structural)_
- [ ] **REQ-1.5** Selecting a category filters the product list to that category _(behavioral · Positive)_
- [ ] **REQ-1.6** A category with no products -> empty list, message "No products found" _(behavioral · EP)_
- [ ] **REQ-1.7** Resetting to "All categories" brings back the full list _(behavioral · Positive)_

### REQ-2: The Subcategory select depends on the category

- [ ] **REQ-2.1** The Subcategory filter is present on the page _(structural)_
- [ ] **REQ-2.2** The default state of Subcategory is disabled _(structural)_
- [ ] **REQ-2.3** Selecting a category enables Subcategory and shows that category's subcategories _(behavioral · State transition)_
- [ ] **REQ-2.4** Changing the category clears the selected subcategory _(behavioral · State transition)_
- [ ] **REQ-2.5** Selecting "All categories" disables Subcategory and clears its value _(behavioral · State transition)_

### REQ-3: The "Quantity" field: maximum 10

- [ ] **REQ-3.1** The "Quantity" field is present _(structural)_
- [ ] **REQ-3.2** The value 10 is accepted without an error _(behavioral · BVA, boundary)_
- [ ] **REQ-3.3** The value 11 -> inline error "Maximum 10 items of one product" _(behavioral · Negative + BVA)_
- [ ] **REQ-3.4** A non-numeric value is rejected _(behavioral · Negative)_

> Structural items (REQ-1.1 to 1.4, 2.1 to 2.2, 3.1) do NOT become full TCs in step4:
> they go to the "Structural checks" section of test-cases.md.
> Behavioral items get full test cases.
