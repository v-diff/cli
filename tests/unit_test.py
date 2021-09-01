from main import _get_build_context, _get_dockerignore_files, _is_dockerfile_present, _full_ignore_list, _add_dockerfile_to_build_context
import sys
import unittest
import os
sys.path.append(os.path.join(os.path.dirname(sys.path[0]), ''))

args_example_1 = ['build', '.']
args_example_2 = ['build', '-t', 'test:test', '-f', './test_dockerfile', './']
args_example_3 = ['build', '../test/', '-q', '--compress']
# fail case
args_example_4 = ['build', '-f' './']
args_example_5 = ['build', '-o', 'test_file', '.', "-t", "test"]

# real repo build cases
args

class cliTestCase(unittest.TestCase):
    def test_get_dockerignore_files(self):
        out = _get_dockerignore_files('./')
        expected_out = []
        self.assertEqual(out, expected_out)

    def test_full_ignore_list(self):
        out = _full_ignore_list(
            './', ['# comment', '*/test*', '*/*/index*', 'temp/', 'check?'])
        expected_out = ['./example_files/testing.txt', '.dockerignore']
        self.assertEqual(out, expected_out)

    def test_is_dockerfile_present_pass_example_1(self):
        out = _is_dockerfile_present(args_example_1)
        self.assertTrue(out)

    def test_is_dockerfile_present_fail_example_2(self):
        out = _is_dockerfile_present(args_example_2)
        self.assertFalse(out)

    def test_is_dockerfile_present_pass_example_3(self):
        out = _is_dockerfile_present(args_example_3)
        self.assertTrue(out)

    def test_is_dockerfile_present_pass_example_4(self):
        out = _is_dockerfile_present(args_example_4)
        self.assertTrue(out)

    def test_is_dockerfile_present_pass_example_5(self):
        out = _is_dockerfile_present(args_example_5)
        self.assertTrue(out)

    def test_add_dockerfile_to_build_context_example_1(self):
        out = _add_dockerfile_to_build_context(
            args_example_1, './tmp_add_dockerfile_to_build_test/')
        self.assertIsNone(out)

    def test_add_dockerfile_to_build_context_example_2(self):
        out = _add_dockerfile_to_build_context(
            args_example_2, './tmp_add_dockerfile_to_build_test/')
        self.assertRaises(str(FileNotFoundError), out)

    def test_add_dockerfile_to_build_context_example_3(self):
        out = _add_dockerfile_to_build_context(
            args_example_3, './tmp_add_dockerfile_to_build_test/')
        self.assertIsNone(out)

    def test_add_dockerfile_to_build_context_example_4(self):
        out = _add_dockerfile_to_build_context(
            args_example_4, './tmp_add_dockerfile_to_build_test/')
        self.assertIsNone(out)

    def test_add_dockerfile_to_build_context_example_5(self):
        out = _add_dockerfile_to_build_context(
            args_example_5, './tmp_add_dockerfile_to_build_test/')
        self.assertIsNone(out)
    # returns place + build_arg value

    def test_get_build_context_1(self):
        out = _get_build_context(args_example_1[1:])
        expected_out = (1, '.')
        self.assertEqual(out, expected_out)

    def test_get_build_context_2(self):
        out = _get_build_context(args_example_2[1:])
        expected_out = (5, './')
        self.assertEqual(out, expected_out)

    def test_get_build_context_3(self):
        out = _get_build_context(args_example_3[1:])
        expected_out = (1, '../test/')
        self.assertEqual(out, expected_out)

    def test_get_build_context_4(self):
        out = _get_build_context(args_example_4[1:])
        expected_out = (None, None)
        self.assertEqual(out, expected_out)

    def test_get_build_context_5(self):
        out = _get_build_context(args_example_5[1:])
        expected_out = (3, '.')
        self.assertEqual(out, expected_out)


if __name__ == '__main__':
    unittest.main()
