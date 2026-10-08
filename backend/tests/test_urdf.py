import unittest
import xml.etree.ElementTree as ET
from pathlib import Path


class TestUrdf(unittest.TestCase):
    def test_has_six_revolute_joints_and_limits(self):
        root = ET.parse(Path(__file__).parents[1] / 'urdf' / 'mini_6dof.urdf').getroot()
        joints = root.findall('joint')
        revolute = [j for j in joints if j.attrib.get('type') == 'revolute']
        self.assertEqual(len(revolute), 6)
        for joint in revolute:
            limit = joint.find('limit')
            self.assertIsNotNone(limit)
            self.assertLess(float(limit.attrib['lower']), float(limit.attrib['upper']))

    def test_joint_names_are_unique(self):
        root = ET.parse(Path(__file__).parents[1] / 'urdf' / 'mini_6dof.urdf').getroot()
        joints = root.findall('joint')
        names = [joint.attrib['name'] for joint in joints]
        self.assertEqual(len(names), len(set(names)))

    def test_base_and_tool_links_exist(self):
        root = ET.parse(Path(__file__).parents[1] / 'urdf' / 'mini_6dof.urdf').getroot()
        links = {link.attrib['name'] for link in root.findall('link')}
        self.assertIn('base_link', links)
        self.assertIn('tool0', links)


if __name__ == '__main__':
    unittest.main()
