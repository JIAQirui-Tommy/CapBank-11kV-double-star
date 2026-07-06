# Double Star Capacitor Bank Unbalance Optimizer

A browser-based tool for calculating and reducing neutral unbalance current in an 11 kV double-star capacitor bank.

Live app: https://jiaqirui-tommy.github.io/CapBank-11kV-double-star/

## What It Does

- Models a double-star capacitor bank with 18 capacitors.
- Each star has three branches: Red, Yellow, and Blue.
- Each branch contains three capacitors.
- Capacitor labels follow the pattern `R11`, `R12`, `R13`, `Y11`, `B11`, `R21`, etc.
- Calculates the neutral unbalance current using the engineering formula from the original project.
- Searches for capacitor swap recommendations to reduce unbalance current.
- Allows the user to choose a fixed number of swap pairs or use Auto mode.
- Highlights applied swaps with different colors.
- Loads capacitor values from CSV instead of manual entry.
- Exports the recommended swap record as a CSV file that can be opened in Excel.

## Default Settings

- Line voltage: `11 kV`
- Frequency: `50 Hz`
- Nominal capacitance: `22 μF`
- Displayed unbalance current unit: `mA`

If the original engineering input uses `11300 V`, set the line voltage in the app to `11.3 kV`.

## Calculation Logic

The app first sums the capacitance of each branch:

```text
AR, AY, AB = Star 1 Red, Yellow, Blue branch totals
BR, BY, BB = Star 2 Red, Yellow, Blue branch totals
X = AR + AY + AB + BR + BY + BB
```

Then it calculates:

```text
S1 = BR * (AY - AB)
S2 = AR * (BB - BY)
S3 = AY * BB - AB * BY
S4 = AR * (BY + BB)
S5 = BR * (AY + AB)
```

The balance term is:

```text
bal = sqrt((S1 + S2 + 2S3)^2 + 3(S4 - S5)^2)
```

The neutral unbalance current is calculated as:

```text
I_unbalance = 0.001 * V * 2πf * bal / (2X)
```

Where:

- `V` is the line voltage in volts.
- `f` is the frequency in Hz.
- Branch capacitances are entered in `μF`.
- The app displays the result in `mA`.
- Main results are displayed to `0.00 mA`.
- Auto mode stops at the smallest swap count whose displayed current rounds to `0.00 mA`.

## Swap Optimization Logic

The optimizer tries capacitor swaps and keeps the combinations that produce the lowest calculated unbalance current.

For the selected number of swap pairs:

1. It generates possible capacitor pair swaps.
2. It prevents the same capacitor position from being reused in the same recommendation.
3. It evaluates each candidate layout using the same unbalance-current formula.
4. It keeps the best layouts at each depth using the selected search width.
5. It recommends the layout with the lowest final unbalance current.

In `Auto` mode, the optimizer starts from the smallest swap count and stops as soon as the displayed result rounds to `0.00 mA`. If that target is not reached, it returns the lowest result found within the search limit.

The `Search width` setting controls how many candidate layouts are retained during the search:

- `Fast`: fewer candidates, quicker result.
- `Balanced`: default.
- `Deep`: more candidates, slower but broader search.

## Exported CSV

After running `Optimize`, click `Export CSV` to download the swap record.

The CSV includes:

- Created time
- Line voltage
- Frequency
- Nominal capacitance
- Selected swap-pair count
- Before and after unbalance current in `mA`
- Improvement percentage
- Number of capacitors moved
- Each recommended swap pair, including capacitor ID, original location, target location, and capacitance

## Loading CSV

Click `Load CSV` to import measured capacitance values.

Supported formats:

```text
Capacitor,Capacitance uF
R11,22.10
R12,21.92
...
```

or 18 numeric values in the same order as the on-screen layout:

```text
22.10,21.92,22.03,21.77,22.14,22.05,22.28,21.88,22.08,
21.98,22.18,21.86,22.04,21.80,22.16,21.93,22.25,22.01
```

## How To Use

1. Open the live app.
2. Enter the measured capacitance value for each capacitor.
3. Select the number of swap pairs, or leave it on `Auto`.
4. Select the search width.
5. Click `Optimize`.
6. Review the recommended swaps.
7. Click `Apply` to update the on-screen layout.
8. Click `Export CSV` to save the swap record.

## Files

- `index.html`: page structure
- `styles.css`: visual styling
- `app.js`: calculation, optimization, highlighting, and CSV export logic
