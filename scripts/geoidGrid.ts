import { meanSeaLevel } from 'egm96-universal';
import { geoidGridSize } from '../src/position/geoid';

/**
 * Samples the EGM96 geoid (egm96-universal, 15' NGA grid) onto a coarse grid of int16
 * decimetres: rows from 90°N southwards, columns from 0°E eastwards.
 */
export function sampleGeoidGrid(step: number): Int16Array {
  const { rows, cols } = geoidGridSize(step);
  const grid = new Int16Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) grid[r * cols + c] = Math.round(meanSeaLevel(90 - r * step, c * step) * 10);
  }
  return grid;
}
