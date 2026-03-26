from __future__ import annotations

import unittest

from erpnext_ai_tutor.tutor.training_replies import _start_tutorial_reply


class TrainingRepliesLogicTests(unittest.TestCase):
	def test_start_tutorial_reply_is_neutral_in_uzbek(self):
		reply = _start_tutorial_reply("uz", "Item")
		self.assertIn("Item", reply)
		self.assertNotIn("Add/New", reply)
		self.assertNotIn("Save/Submit", reply)

	def test_start_tutorial_reply_is_neutral_in_english(self):
		reply = _start_tutorial_reply("en", "Item")
		self.assertIn("Item", reply)
		self.assertNotIn("Add/New", reply)
		self.assertNotIn("Save/Submit", reply)


if __name__ == "__main__":
	unittest.main()
