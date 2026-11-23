# Test cases example

A sample of the level of detail, the use of techniques and the split from the checklist
(architecture A). The format follows `output-template.md`. The requirements are the same
as in `checklist-example.md`.

---

## Structural checks (quick, no steps)

> Verified by the presence/state of an element; no full TC needed.
> Inherited from the checklist (tag `structural`).

- [ ] REQ-1.1 The Category filter is present on the page
- [ ] REQ-1.2 The Category filter is a select (dropdown)
- [ ] REQ-1.3 The category list is filled with options
- [ ] REQ-1.4 Category default: "All categories"
- [ ] REQ-2.1 The Subcategory filter is present on the page
- [ ] REQ-2.2 Subcategory default: disabled
- [ ] REQ-3.1 The "Quantity" field is present

---

## REQ-1: The Category select filters the product list by category

### TC-REQ-1.5: Filtering by category (happy path) 🔹SMOKE

- **Technique:** Use Case + EP
- **Precondition:** The product listing page is open, Category = "All categories"
- **Test data:** category = Kitchen
- **Steps:**
    1. Select Kitchen in the Category select
    2. Look at the product list
- **Expected result:** only products of the Kitchen category remain in the list

### TC-REQ-1.6: Category with no products (empty valid partition)

- **Technique:** EP
- **Precondition:** Category = "All categories"
- **Test data:** category = Garden (no products)
- **Steps:**
    1. Select Garden
- **Expected result:** the list is empty, "No products found" is shown

### TC-REQ-1.7: Resetting the category filter

- **Technique:** Use Case
- **Precondition:** Category = Kitchen, the list is filtered
- **Steps:**
    1. Select "All categories" in the Category select
- **Expected result:** products of all categories are shown

## REQ-2: The Subcategory select depends on the category

### TC-REQ-2.3: Subcategory is enabled when a category is selected

- **Technique:** State Transition
- **Precondition:** Category = "All categories", Subcategory is disabled
- **Steps:**
    1. Select Kitchen in Category
    2. Open the Subcategory select
- **Expected result:** Subcategory is enabled, the list holds only Kitchen subcategories

### TC-REQ-2.4: Changing the category clears the selected subcategory

- **Technique:** State Transition
- **Precondition:** Category = Kitchen, Subcategory = Cookware
- **Steps:**
    1. Change the category to Electronics
- **Expected result:** Subcategory is cleared, the list is updated with Electronics subcategories

## REQ-3: The "Quantity" field: maximum 10

### TC-REQ-3.2: Value at the limit (happy path)

- **Technique:** BVA (10, the upper boundary)
- **Precondition:** A product is in the cart, the cart page is open
- **Test data:** quantity = 10
- **Steps:**
    1. Enter 10 in the "Quantity" field
    2. Confirm
- **Expected result:** the value is accepted, there is no error

### TC-REQ-3.3: Over the limit (negative + boundary)

- **Technique:** Negative + BVA (11, beyond the boundary)
- **Precondition:** A product is in the cart, the cart page is open
- **Test data:** quantity = 11
- **Steps:**
    1. Enter 11 in the "Quantity" field
- **Expected result:** inline error "Maximum 10 items of one product", the value is not accepted

### TC-REQ-3.4: Non-numeric input (negative)

- **Technique:** Negative / EP (invalid partition)
- **Precondition:** A product is in the cart, the cart page is open
- **Test data:** quantity = "abc"
- **Steps:**
    1. Enter "abc"
- **Expected result:** the input is rejected, the field accepts numbers only

---

## Statistics (example)

- Requirements covered: 3 (REQ-1, REQ-2, REQ-3)
- Structural checks (no TC): 7
- Full test cases: 8
