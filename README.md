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
- Allows the user to choose how many swap pairs to apply.
- Highlights applied swaps with different colors.
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
- The displayed result is rounded up to the next `0.001 mA`.

## Swap Optimization Logic

The optimizer tries capacitor swaps and keeps the combinations that produce the lowest calculated unbalance current.

For the selected number of swap pairs:

1. It generates possible capacitor pair swaps.
2. It prevents the same capacitor position from being reused in the same recommendation.
3. It evaluates each candidate layout using the same unbalance-current formula.
4. It keeps the best layouts at each depth using the selected search width.
5. It recommends the layout with the lowest final unbalance current.

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

## How To Use

1. Open the live app.
2. Enter the measured capacitance value for each capacitor.
3. Select the number of swap pairs.
4. Select the search width.
5. Click `Optimize`.
6. Review the recommended swaps.
7. Click `Apply` to update the on-screen layout.
8. Click `Export CSV` to save the swap record.

## Files

- `index.html`: page structure
- `styles.css`: visual styling
- `app.js`: calculation, optimization, highlighting, and CSV export logic
