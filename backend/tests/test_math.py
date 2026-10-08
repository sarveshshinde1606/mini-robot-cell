import unittest


def pixel_to_mm(u, v, width, height, mm_per_pixel):
    return ((u - width / 2) * mm_per_pixel, (v - height / 2) * mm_per_pixel)


def latency_compensation(belt_speed_mps, latency_ms):
    return belt_speed_mps * (latency_ms / 1000.0) * 1000.0


class TestPickMath(unittest.TestCase):
    def test_center_is_zero(self):
        self.assertEqual(pixel_to_mm(640, 360, 1280, 720, 0.4), (0.0, 0.0))

    def test_offset(self):
        self.assertEqual(pixel_to_mm(740, 310, 1280, 720, 0.4), (40.0, -20.0))

    def test_display_scaling_is_source_independent(self):
        # The UI first converts display coordinates back to source pixels.
        display_u = 370
        display_v = 155
        source_u = display_u * 1280 / 640
        source_v = display_v * 720 / 360
        self.assertEqual(pixel_to_mm(source_u, source_v, 1280, 720, 0.4), (40.0, -20.0))

    def test_latency(self):
        self.assertAlmostEqual(latency_compensation(0.25, 200), 50.0)


if __name__ == '__main__':
    unittest.main()
