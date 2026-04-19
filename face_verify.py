import time
import random

def verify_face(image_data):
    """
    Simulates OpenCV face verification. 
    In a real system, this would decode the image data (base64) 
    and compare it against a registered face using a model.
    """
    # Simulate processing delay
    time.sleep(2)
    # Simulate 95% success rate for demonstration purposes
    return random.random() < 0.95
